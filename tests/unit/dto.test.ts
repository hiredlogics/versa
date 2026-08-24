import { describe, expect, it } from "vitest";
import {
  LEAD_SELECT,
  isStaleRunning,
  toCreditsDTO,
  toLeadDTO,
  toSearchDTO,
} from "@/lib/pipeline/dto";

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    name: "Dana Reed",
    title: "HR Manager",
    company: "Acme",
    industry: "software",
    employees: 60,
    location: "Toronto, Ontario, Canada",
    email: "dana@acme.com",
    emailStatus: "verified",
    linkedinUrl: "https://linkedin.com/in/dana",
    leadScore: 8,
    priorityLevel: "HIGH",
    reasoning: "Runs people ops at a 60-person software firm.",
    whySource: "AI",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Parameters<typeof toLeadDTO>[0];
}

describe("the vendor boundary", () => {
  // Adding a field must fail a test rather than quietly ship. Asserting the
  // exact key set does that; asserting the absence of known-bad keys does not.
  it("returns exactly these lead keys", () => {
    expect(Object.keys(toLeadDTO(leadRow())).sort()).toEqual([
      "company",
      "createdAt",
      "email",
      "emailStatus",
      "employees",
      "id",
      "industry",
      "linkedinUrl",
      "location",
      "name",
      "priority",
      "score",
      "title",
      "whySource",
      "why",
    ].sort());
  });

  it("never emits the provider's id or raw payload, as values or as field names", () => {
    const serialised = JSON.stringify(toLeadDTO(leadRow())).toLowerCase();
    expect(serialised).not.toContain("apollo");
    expect(serialised).not.toContain("rawapollodata");
  });

  it("selects only safe columns from the database", () => {
    // rawApolloData and apolloPersonId must never be readable by the API layer.
    const selected = Object.keys(LEAD_SELECT).join(",").toLowerCase();
    expect(selected).not.toContain("apollo");
    expect(selected).not.toContain("raw");
  });

  it("returns exactly these search keys", () => {
    const search = {
      id: "s1",
      status: "COMPLETE" as const,
      prompt: "HR managers in Toronto",
      statusNote: "Batch saved.",
      leadsReturned: 100,
      batchesDone: 1,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    expect(Object.keys(toSearchDTO(search, 250, 0)).sort()).toEqual([
      "batchesDone",
      "createdAt",
      "delivered",
      "hasMore",
      "id",
      "note",
      "prompt",
      "requested",
      "stale",
      "status",
    ]);
  });

  it("returns exactly these credit keys, and no internal period start", () => {
    const dto = toCreditsDTO({
      planName: "Starter",
      limit: 500,
      used: 100,
      remaining: 400,
      pending: 25,
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-02-01T00:00:00Z"),
    });

    expect(Object.keys(dto).sort()).toEqual([
      "limit",
      "pending",
      "periodEnd",
      "planName",
      "remaining",
      "used",
    ]);
  });
});

describe("hasMore and stale", () => {
  const base = {
    id: "s1",
    status: "COMPLETE" as const,
    prompt: "p",
    statusNote: null,
    leadsReturned: 100,
    batchesDone: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("offers more only when the request is unfinished", () => {
    expect(toSearchDTO(base, 250, 0).hasMore).toBe(true);
    expect(toSearchDTO({ ...base, leadsReturned: 250 }, 250, 0).hasMore).toBe(false);
  });

  it("flags a RUNNING search with nothing in flight as stale", () => {
    const old = new Date(Date.now() - 10 * 60_000);
    // A batch that died without settling would otherwise leave the user a dead
    // button and no explanation.
    expect(isStaleRunning({ status: "RUNNING", updatedAt: old }, 0)).toBe(true);
    // Still working: a hold is open.
    expect(isStaleRunning({ status: "RUNNING", updatedAt: old }, 1)).toBe(false);
    // Recently started.
    expect(isStaleRunning({ status: "RUNNING", updatedAt: new Date() }, 0)).toBe(false);
    expect(isStaleRunning({ status: "COMPLETE", updatedAt: old }, 0)).toBe(false);
  });
});
