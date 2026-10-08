import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  InsufficientCreditsError,
  balance,
  commit,
  release,
  releaseStale,
  reserve,
} from "@/lib/pipeline/credits";

const prisma = new PrismaClient();

const PLAN_LIMIT = 500;
const PERIOD_START = new Date(Date.UTC(2030, 0, 1));
const PERIOD_END = new Date(Date.UTC(2030, 1, 1));

let planId: string;
let userId: string;
let searchId: string;

/**
 * The one property that must hold after every operation. If this drifts, some
 * path deducted or refunded without settling its hold.
 */
async function expectLedgerBalanced() {
  const usage = await prisma.usageRecord.findUnique({
    where: { userId_periodStart: { userId, periodStart: PERIOD_START } },
  });

  const holds = await prisma.creditHold.findMany({ where: { userId } });
  const expected = holds.reduce((sum, hold) => {
    if (hold.status === "HELD") return sum + hold.amount;
    return sum + (hold.charged ?? 0);
  }, 0);

  expect(usage?.leadsUsed ?? 0).toBe(expected);
}

beforeAll(async () => {
  const plan = await prisma.plan.upsert({
    where: { slug: "credits-test-plan" },
    update: { leadsPerMonth: PLAN_LIMIT },
    create: {
      slug: "credits-test-plan",
      name: "Credits Test Plan",
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
      clerkId: `credits-test-${crypto.randomUUID()}`,
      email: `credits-test-${crypto.randomUUID()}@example.com`,
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
    data: { userId, prompt: "credits test", status: "RUNNING" },
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

function key(batchNo: number) {
  return `${searchId}:${batchNo}`;
}

describe("reserve", () => {
  it("deducts up front and reports the hold", async () => {
    const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(1) });

    expect(hold.status).toBe("HELD");
    expect(hold.amount).toBe(100);
    await expectLedgerBalanced();
    expect((await balance(userId)).remaining).toBe(PLAN_LIMIT - 100);
  });

  it("refuses an over-reserve and leaves the balance untouched", async () => {
    await expect(
      reserve({ userId, searchId, amount: PLAN_LIMIT + 1, idempotencyKey: key(1) })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    expect((await balance(userId)).used).toBe(0);
    await expectLedgerBalanced();
  });

  it("returns the same hold for a repeated key without double-charging", async () => {
    const first = await reserve({ userId, searchId, amount: 50, idempotencyKey: key(1) });
    const second = await reserve({ userId, searchId, amount: 50, idempotencyKey: key(1) });

    expect(second.id).toBe(first.id);
    expect((await balance(userId)).used).toBe(50);
    await expectLedgerBalanced();
  });

  it("reports pending separately from spent", async () => {
    await reserve({ userId, searchId, amount: 80, idempotencyKey: key(1) });
    const snapshot = await balance(userId);

    expect(snapshot.pending).toBe(80);
    expect(snapshot.used).toBe(80);
    expect(snapshot.planName).toBe("Credits Test Plan");
  });
});

describe("commit and release", () => {
  it("refunds the remainder on a partial commit", async () => {
    const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(1) });
    const result = await commit(hold.id, 60);

    expect(result).toEqual({ charged: 60, refunded: 40 });
    expect((await balance(userId)).used).toBe(60);
    await expectLedgerBalanced();
  });

  it("clamps a commit larger than the hold", async () => {
    const hold = await reserve({ userId, searchId, amount: 10, idempotencyKey: key(1) });
    expect((await commit(hold.id, 999)).charged).toBe(10);
    await expectLedgerBalanced();
  });

  it("does not double-charge on a repeated commit", async () => {
    const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(1) });
    await commit(hold.id, 60);
    const second = await commit(hold.id, 60);

    expect(second.refunded).toBe(0);
    expect((await balance(userId)).used).toBe(60);
    await expectLedgerBalanced();
  });

  it("does not double-refund on a repeated release", async () => {
    const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(1) });
    await release(hold.id);
    expect(await release(hold.id)).toBe(0);

    expect((await balance(userId)).used).toBe(0);
    await expectLedgerBalanced();
  });

  it("treats release after commit as a no-op", async () => {
    const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(1) });
    await commit(hold.id, 70);
    expect(await release(hold.id)).toBe(0);

    expect((await balance(userId)).used).toBe(70);
    await expectLedgerBalanced();
  });
});

describe("concurrency", () => {
  // A race that passes once may just have been scheduled kindly.
  const RUNS = 5;

  it("lets exactly one of two competing reserves through", async () => {
    for (let run = 0; run < RUNS; run++) {
      const results = await Promise.allSettled([
        reserve({ userId, searchId, amount: 300, idempotencyKey: key(run * 2 + 1) }),
        reserve({ userId, searchId, amount: 300, idempotencyKey: key(run * 2 + 2) }),
      ]);

      const ok = results.filter((r) => r.status === "fulfilled");
      expect(ok).toHaveLength(1);
      await expectLedgerBalanced();

      for (const settled of ok) {
        await release((settled as PromiseFulfilledResult<{ id: string }>).value.id);
      }
      await expectLedgerBalanced();
    }
  });

  it("refunds once when the same hold is released twice in parallel", async () => {
    for (let run = 0; run < RUNS; run++) {
      const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(run) });

      const [a, b] = await Promise.all([release(hold.id), release(hold.id)]);

      expect(a + b).toBe(100);
      expect((await balance(userId)).used).toBe(0);
      await expectLedgerBalanced();
    }
  });

  it("charges once when the same hold is committed twice in parallel", async () => {
    for (let run = 0; run < RUNS; run++) {
      // A committed hold cannot be released, so reset rather than accumulate.
      await prisma.creditHold.deleteMany({ where: { userId } });
      await prisma.usageRecord.deleteMany({ where: { userId } });

      const hold = await reserve({ userId, searchId, amount: 100, idempotencyKey: key(run) });

      const [a, b] = await Promise.all([commit(hold.id, 40), commit(hold.id, 90)]);

      // Exactly one commit settles the hold; the other is a no-op returning it.
      const charged = Math.max(a.charged, b.charged);
      expect([40, 90]).toContain(charged);
      expect(a.refunded + b.refunded).toBe(100 - charged);
      expect((await balance(userId)).used).toBe(charged);
      await expectLedgerBalanced();
    }
  });

  it("increments once when the same key is reserved twice in parallel", async () => {
    for (let run = 0; run < RUNS; run++) {
      const results = await Promise.all([
        reserve({ userId, searchId, amount: 25, idempotencyKey: key(run) }),
        reserve({ userId, searchId, amount: 25, idempotencyKey: key(run) }),
      ]);

      expect(results[0].id).toBe(results[1].id);
      await expectLedgerBalanced();
      await release(results[0].id);
    }
  });

  it("survives two first-of-period reserves racing to create the usage row", async () => {
    for (let run = 0; run < RUNS; run++) {
      await prisma.creditHold.deleteMany({ where: { userId } });
      await prisma.usageRecord.deleteMany({ where: { userId } });

      const results = await Promise.allSettled([
        reserve({ userId, searchId, amount: 10, idempotencyKey: `${searchId}:a${run}` }),
        reserve({ userId, searchId, amount: 10, idempotencyKey: `${searchId}:b${run}` }),
      ]);

      const failures = results.filter((r) => r.status === "rejected");
      expect(failures).toHaveLength(0);

      const usage = await prisma.usageRecord.findMany({ where: { userId } });
      expect(usage).toHaveLength(1);
      await expectLedgerBalanced();
    }
  });
});

describe("the lock itself", () => {
  // The race tests would still pass if reserve stopped locking but the
  // scheduler happened to serialise them. This asserts the lock actually
  // blocks, so a refactor to a predicate-based lock fails here first,   // a predicate on periodStart matches zero rows and locks nothing.
  it("blocks a second transaction until the first commits", async () => {
    await reserve({ userId, searchId, amount: 1, idempotencyKey: key(1) });

    const usage = await prisma.usageRecord.findUnique({
      where: { userId_periodStart: { userId, periodStart: PERIOD_START } },
      select: { id: true },
    });
    expect(usage).not.toBeNull();

    const HOLD_MS = 700;
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "leadsUsed" FROM "UsageRecord" WHERE id = $1 FOR UPDATE`,
          usage!.id
        );
        await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
      },
      { timeout: 10_000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const startedAt = Date.now();
    const waited = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "leadsUsed" FROM "UsageRecord" WHERE id = $1 FOR UPDATE`,
          usage!.id
        );
        return Date.now() - startedAt;
      },
      { timeout: 10_000 }
    );

    await holder;
    expect(waited).toBeGreaterThan(300);
  });
});

describe("releaseStale", () => {
  it("frees an aged hold and leaves a fresh one alone", async () => {
    const aged = await reserve({ userId, searchId, amount: 40, idempotencyKey: key(1) });
    const fresh = await reserve({ userId, searchId, amount: 20, idempotencyKey: key(2) });

    await prisma.creditHold.update({
      where: { id: aged.id },
      data: { createdAt: new Date(Date.now() - 60 * 60_000) },
    });

    expect(await releaseStale(30)).toBe(1);

    expect((await prisma.creditHold.findUnique({ where: { id: aged.id } }))?.status).toBe("RELEASED");
    expect((await prisma.creditHold.findUnique({ where: { id: fresh.id } }))?.status).toBe("HELD");
    expect((await balance(userId)).used).toBe(20);
    await expectLedgerBalanced();
  });
});
