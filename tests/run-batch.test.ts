import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderCreditsError, runBatch, type RunBatchDeps } from "@/lib/pipeline/run";
import { balance } from "@/lib/pipeline/credits";
import type { Brief, VerifiedLead } from "@/lib/pipeline/types";
// The same client instance run.ts uses, so spying on it actually intercepts.
import { prisma } from "@/lib/db/prisma";

const PLAN_LIMIT = 500;
const PERIOD_START = new Date(Date.UTC(2035, 0, 1));
const PERIOD_END = new Date(Date.UTC(2035, 1, 1));

let planId: string;
let userId: string;
let searchId: string;

const brief: Brief = {
  intent: "HR managers in Toronto",
  titles: ["HR Manager"],
  location: "Toronto",
  industry: "software",
  employeeRanges: ["11,50", "51,200"],
  signals: [],
  excludeTitles: ["intern"],
  excludeIndustries: [],
  requestedTotal: 100,
};

function person(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    first_name: "Dana",
    last_name: id,
    title: "HR Manager",
    email: `${id}@acme.com`,
    has_email: true,
    city: "Toronto",
    country: "Canada",
    organization: { name: "Acme", industry: "software", estimated_num_employees: 60 },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<RunBatchDeps> = {}): RunBatchDeps {
  return {
    searchPage: vi.fn(async () => ({ people: [person("a"), person("b")], totalPages: 5 })),
    unlockEmails: vi.fn(async (candidates) => {
      const map = new Map();
      for (const c of candidates) map.set(c.providerId, { email: `${c.providerId}@acme.com`, emailStatus: "verified" });
      return map;
    }),
    writeWhy: vi.fn(async (leads: VerifiedLead[]) =>
      leads.map((lead) => ({
        ...lead,
        why: `Solid reason for ${lead.candidate.name} at Acme.`,
        whySource: "AI" as const,
      }))
    ),
    isUsableEmail: (email: string) => email.includes("@"),
    ...overrides,
  };
}

/** The invariant after every failure: nothing left reserved. */
async function expectNoHeldHolds() {
  const held = await prisma.creditHold.findMany({ where: { searchId, status: "HELD" } });
  expect(held).toHaveLength(0);
}

beforeAll(async () => {
  const plan = await prisma.plan.upsert({
    where: { slug: "runbatch-test-plan" },
    update: { leadsPerMonth: PLAN_LIMIT },
    create: {
      slug: "runbatch-test-plan",
      name: "RunBatch Test Plan",
      leadsPerMonth: PLAN_LIMIT,
      searchesPerMonth: 100,
      features: {},
    },
  });
  planId = plan.id;
});

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      clerkId: `runbatch-${crypto.randomUUID()}`,
      email: `runbatch-${crypto.randomUUID()}@example.com`,
    },
  });
  userId = user.id;
  await prisma.subscription.create({
    data: {
      userId,
      planId,
      status: "ACTIVE",
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
    },
  });
  const search = await prisma.leadSearch.create({
    data: { userId, prompt: "HR managers in Toronto", status: "RUNNING" },
  });
  searchId = search.id;
});

afterEach(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

afterAll(async () => {
  await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("failure paths", () => {
  it("releases the hold when writeWhy throws", async () => {
    // The provider credits are already spent here, which is exactly why it is
    // tempting to charge anyway. The user received zero rows.
    const before = (await balance(userId)).used;
    const deps = makeDeps({
      writeWhy: vi.fn(async () => {
        throw new Error("why provider down");
      }),
    });

    await expect(runBatch({ userId, searchId, brief }, deps)).rejects.toThrow("why provider down");

    expect((await balance(userId)).used).toBe(before);
    const hold = await prisma.creditHold.findFirst({ where: { searchId } });
    expect(hold?.status).toBe("RELEASED");
    await expectNoHeldHolds();
  });

  it("releases the hold when the unlock throws mid-flight", async () => {
    const before = (await balance(userId)).used;
    const deps = makeDeps({
      unlockEmails: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });

    await expect(runBatch({ userId, searchId, brief }, deps)).rejects.toThrow("socket hang up");

    expect((await balance(userId)).used).toBe(before);
    const search = await prisma.leadSearch.findUnique({ where: { id: searchId } });
    expect(search?.status).toBe("FAILED");
    expect(search?.statusNote).toMatch(/nothing was charged/i);
    await expectNoHeldHolds();
  });

  it("releases the hold and invites a retry on a provider credit error", async () => {
    const before = (await balance(userId)).used;
    const deps = makeDeps({
      unlockEmails: vi.fn(async () => {
        throw new ProviderCreditsError();
      }),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.reason).toBe("provider_unavailable");
    expect(result.hasMore).toBe(true);
    expect(result.note.toLowerCase()).not.toContain("apollo");
    expect(result.note).toMatch(/nothing was charged/i);
    expect((await balance(userId)).used).toBe(before);
    await expectNoHeldHolds();
  });

  it("releases the hold when createMany throws", async () => {
    const before = (await balance(userId)).used;
    const spy = vi.spyOn(prisma.lead, "createMany").mockRejectedValueOnce(new Error("db down"));

    await expect(runBatch({ userId, searchId, brief }, makeDeps())).rejects.toThrow("db down");

    expect((await balance(userId)).used).toBe(before);
    await expectNoHeldHolds();
    spy.mockRestore();
  });

  it("never reserves when the request is already fulfilled", async () => {
    await prisma.leadSearch.update({ where: { id: searchId }, data: { leadsReturned: 100 } });
    const deps = makeDeps();

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.reason).toBe("fulfilled");
    expect(result.hasMore).toBe(false);
    // A balance can be right for the wrong reason: assert nothing was called.
    expect(deps.searchPage).not.toHaveBeenCalled();
    expect(deps.unlockEmails).not.toHaveBeenCalled();
    expect(await prisma.creditHold.count({ where: { searchId } })).toBe(0);
  });
});

describe("the three no-reserve states", () => {
  it("reports no_matches_this_pass when pages remain", async () => {
    const deps = makeDeps({
      searchPage: vi.fn(async () => ({
        people: [person(`x${Math.random()}`, { title: "Truck Driver" })],
        totalPages: 100,
      })),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.reason).toBe("no_matches_this_pass");
    expect(result.hasMore).toBe(true);
    expect(result.note).toMatch(/widen/i);
    expect(deps.unlockEmails).not.toHaveBeenCalled();
    expect(await prisma.creditHold.count({ where: { searchId } })).toBe(0);
  });

  it("reports exhausted when a page comes back empty", async () => {
    const deps = makeDeps({
      searchPage: vi.fn(async () => ({ people: [], totalPages: 9 })),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.reason).toBe("exhausted");
    expect(result.hasMore).toBe(false);
    expect(deps.unlockEmails).not.toHaveBeenCalled();
  });

  it("does not treat a missing totalPages as exhausted", async () => {
    // Absent metadata is not evidence. This must keep looking, not stop.
    const deps = makeDeps({
      searchPage: vi.fn(async () => ({
        people: [person("y", { title: "Truck Driver" })],
        totalPages: null,
      })),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.reason).toBe("no_matches_this_pass");
    expect(result.hasMore).toBe(true);
  });

  it("stops cleanly when the page budget runs out", async () => {
    const deps = makeDeps({
      searchPage: vi.fn(async () => ({
        people: [person(`p${Math.random()}`, { title: "Truck Driver" })],
        totalPages: 100,
      })),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(deps.searchPage).toHaveBeenCalledTimes(10);
    expect(result.reason).toBe("no_matches_this_pass");
  });
});

describe("the stale escape hatch racing a slow batch", () => {
  // /next allows a call when a RUNNING search looks stale. If the original
  // batch was merely slow rather than dead, two runBatch calls execute at the
  // same batchNo: this is where the escape hatch and the idempotency
  // guarantee have to hold together.
  const RUNS = 3;

  it("creates one hold, charges once, and saves no duplicates", async () => {
    for (let run = 0; run < RUNS; run++) {
      await prisma.lead.deleteMany({ where: { searchId } });
      await prisma.creditHold.deleteMany({ where: { searchId } });
      await prisma.usageRecord.deleteMany({ where: { userId } });
      await prisma.leadSearch.update({
        where: { id: searchId },
        data: { status: "RUNNING", leadsReturned: 0, batchesDone: 0, nextPage: 1 },
      });

      const deps = makeDeps({
        searchPage: vi.fn(async (_f, page) => ({
          people: page === 1 ? [person("a"), person("b")] : [],
          totalPages: 2,
        })),
      });

      const results = await Promise.allSettled([
        runBatch({ userId, searchId, brief }, deps),
        runBatch({ userId, searchId, brief }, deps),
      ]);

      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThan(0);

      const holds = await prisma.creditHold.findMany({ where: { searchId } });
      expect(holds).toHaveLength(1);

      const leads = await prisma.lead.findMany({
        where: { searchId },
        select: { apolloPersonId: true },
      });
      expect(new Set(leads.map((l) => l.apolloPersonId)).size).toBe(leads.length);

      // leadsUsed === charged(settled) + amount(held), same invariant as the
      // credit ledger tests.
      const usage = await prisma.usageRecord.findUnique({
        where: { userId_periodStart: { userId, periodStart: PERIOD_START } },
      });
      const expected = holds.reduce(
        (sum, hold) => sum + (hold.status === "HELD" ? hold.amount : (hold.charged ?? 0)),
        0
      );
      expect(usage?.leadsUsed ?? 0).toBe(expected);
      await expectNoHeldHolds();
    }
  });
});

describe("happy path", () => {
  it("charges for survivors, not for people fetched", async () => {
    const people = [
      ...Array.from({ length: 40 }, (_, i) => person(`ok${i}`)),
      ...Array.from({ length: 60 }, (_, i) => person(`no${i}`, { title: "Truck Driver" })),
    ];
    const deps = makeDeps({
      searchPage: vi.fn(async (_f, page) => ({ people: page === 1 ? people : [], totalPages: 3 })),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.fetched).toBe(100);
    expect(result.saved).toBe(40);
    expect(result.charged).toBe(40);
    expect((await balance(userId)).used).toBe(40);
    await expectNoHeldHolds();
  });

  it("refunds unlocks that came back without an email", async () => {
    const deps = makeDeps({
      searchPage: vi.fn(async (_f, page) => ({
        people: page === 1 ? [person("a"), person("b"), person("c")] : [],
        totalPages: 2,
      })),
      unlockEmails: vi.fn(async (candidates) => {
        const map = new Map();
        map.set(candidates[0].providerId, { email: "a@acme.com", emailStatus: "verified" });
        map.set(candidates[1].providerId, { email: null, emailStatus: null });
        map.set(candidates[2].providerId, { email: "   ", emailStatus: null });
        return map;
      }),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.survivors).toBe(3);
    expect(result.saved).toBe(1);
    expect(result.charged).toBe(1);
    expect(result.refunded).toBe(2);
    expect(result.rejections.no_email).toBe(2);
    await expectNoHeldHolds();
  });

  it("does not double-charge a person seen on an earlier batch", async () => {
    await prisma.lead.create({
      data: {
        userId,
        searchId,
        apolloPersonId: "a",
        name: "Dana a",
        title: "HR Manager",
        company: "Acme",
        leadScore: 7,
        priorityLevel: "HIGH",
        hasEmail: true,
        email: "a@acme.com",
      },
    });
    await prisma.leadSearch.update({ where: { id: searchId }, data: { leadsReturned: 1 } });

    const deps = makeDeps({
      searchPage: vi.fn(async (_f, page) => ({
        people: page === 1 ? [person("a"), person("b")] : [],
        totalPages: 2,
      })),
    });

    const result = await runBatch({ userId, searchId, brief }, deps);

    expect(result.rejections.duplicate).toBe(1);
    expect(result.saved).toBe(1);
    expect(result.charged).toBe(1);
  });

  it("reuses the hold when the same batch is retried", async () => {
    const deps = makeDeps({
      searchPage: vi.fn(async (_f, page) => ({
        people: page === 1 ? [person("a"), person("b")] : [],
        totalPages: 2,
      })),
    });

    await runBatch({ userId, searchId, brief }, deps);
    // batchesDone advanced, so a genuine retry of batch 1 needs the counter back.
    await prisma.leadSearch.update({ where: { id: searchId }, data: { batchesDone: 0, nextPage: 1 } });
    await runBatch({ userId, searchId, brief }, deps);

    const holds = await prisma.creditHold.findMany({ where: { searchId } });
    expect(holds).toHaveLength(1);
    await expectNoHeldHolds();
  });
});
