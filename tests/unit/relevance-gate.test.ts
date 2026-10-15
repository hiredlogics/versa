import { beforeEach, describe, expect, it, vi } from "vitest";

const aiChat = vi.fn();
vi.mock("@/lib/services/ai/aiRouter", () => ({ aiChat: (...args: unknown[]) => aiChat(...args) }));

import { cleanFitCriteria } from "@/lib/services/ai/parsePrompt";
import {
  applyRelevanceGate,
  buildGateCriteria,
  clearRelevanceGateCache,
  gateModeFor,
  gateRank,
  titleMatchesSearch,
  getRelevanceGateMode,
  judgeRelevance,
  type GateResult,
} from "@/lib/services/ai/relevanceGate";

const context = { originalPrompt: "Find heads of payments at US fintech startups" };

const people = [
  { id: "a", title: "Head of Payments", company: "PayCo" },
  { id: "b", title: "Pastry Chef", company: "Bakery" },
  { id: "c", title: "", company: "Unknown" },
];

function reply(items: Array<{ id: string; verdict: string; reason?: string }>) {
  return { content: JSON.stringify({ people: items }), provider: "OPENAI" };
}

beforeEach(() => {
  aiChat.mockReset();
  clearRelevanceGateCache();
});

describe("getRelevanceGateMode", () => {
  it("defaults to log and accepts off and enforce", () => {
    expect(getRelevanceGateMode(undefined)).toBe("log");
    expect(getRelevanceGateMode("nonsense")).toBe("log");
    expect(getRelevanceGateMode(" OFF ")).toBe("off");
    expect(getRelevanceGateMode("enforce")).toBe("enforce");
  });
});

describe("judgeRelevance", () => {
  it("returns a verdict per person and pins OpenAI at temperature 0", async () => {
    aiChat.mockResolvedValueOnce(
      reply([
        { id: "a", verdict: "match", reason: "title is head of payments" },
        { id: "b", verdict: "no", reason: "title is pastry chef" },
      ])
    );

    const result = await judgeRelevance(people, context, { searchId: "s1" });

    expect(result.get("a")?.verdict).toBe("match");
    expect(result.get("b")?.verdict).toBe("no");
    // Skipped by the model, so it passes.
    expect(result.get("c")?.verdict).toBe("unknown");
    const call = aiChat.mock.calls[0][0];
    expect(call.temperature).toBe(0);
    expect(call.onlyProviders).toEqual(["OPENAI"]);
  });

  it("lets everyone through when the AI call fails", async () => {
    aiChat.mockRejectedValueOnce(new Error("timeout"));
    const result = await judgeRelevance(people, context, { searchId: "s1" });
    expect([...result.values()].every((r) => r.verdict === "unknown")).toBe(true);
  });

  it("ignores invented ids and verdicts", async () => {
    aiChat.mockResolvedValueOnce(
      reply([
        { id: "zzz", verdict: "no" },
        { id: "a", verdict: "maybe" },
      ])
    );
    const result = await judgeRelevance(people, context, { searchId: "s1" });
    expect(result.has("zzz")).toBe(false);
    expect(result.get("a")?.verdict).toBe("unknown");
  });

  it("reuses verdicts for the same search instead of asking again", async () => {
    aiChat.mockResolvedValueOnce(reply([{ id: "b", verdict: "no" }]));
    await judgeRelevance([people[1]], context, { searchId: "s1" });
    const again = await judgeRelevance([people[1]], context, { searchId: "s1" });
    expect(again.get("b")?.verdict).toBe("no");
    expect(aiChat).toHaveBeenCalledTimes(1);
  });

  it("makes no call when there is nothing to judge against", async () => {
    const result = await judgeRelevance(people, {}, { searchId: "s1" });
    expect(aiChat).not.toHaveBeenCalled();
    expect(result.get("b")?.verdict).toBe("unknown");
  });

  it("splits large batches into chunks of 25", async () => {
    aiChat.mockResolvedValue(reply([]));
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, title: "CTO", company: "X" }));
    await judgeRelevance(many, context, { searchId: "s2" });
    expect(aiChat).toHaveBeenCalledTimes(3);
  });
});

describe("applyRelevanceGate", () => {
  const verdicts = new Map<string, GateResult>([
    ["a", { verdict: "match", reason: "" }],
    ["b", { verdict: "no", reason: "" }],
  ]);

  it("drops only clear mismatches when enforced", () => {
    const { kept, rejected, summary } = applyRelevanceGate(people, verdicts, "enforce");
    expect(kept.map((p) => p.id)).toEqual(["a", "c"]);
    expect(rejected.map((p) => p.id)).toEqual(["b"]);
    expect(summary).toEqual({ match: 1, partial: 0, no: 1, unknown: 1 });
  });

  it("drops nobody in log mode", () => {
    const { kept, rejected } = applyRelevanceGate(people, verdicts, "log");
    expect(kept).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });
});

describe("gateRank and criteria", () => {
  it("puts matches before maybes before mismatches", () => {
    expect(gateRank("match")).toBeLessThan(gateRank("partial"));
    expect(gateRank("unknown")).toBe(gateRank("partial"));
    expect(gateRank("partial")).toBeLessThan(gateRank("no"));
  });

  it("builds criteria from the request", () => {
    const text = buildGateCriteria({ ...context, keywords: "fintech", openToWork: true });
    expect(text).toContain("Request: Find heads of payments");
    expect(text).toContain("Keywords: fintech");
    // Open to work has its own filter before this check.
    expect(text).not.toContain("looking for work");
  });
});

describe("fit criteria from the parser", () => {
  it("adds each check as a Must fit line", () => {
    const text = buildGateCriteria({ ...context, fitCriteria: ["works on payments"] });
    expect(text).toContain("Must fit: works on payments");
  });

  it("keeps at most 5 short, distinct checks", () => {
    const out = cleanFitCriteria(["a", "A", " ", null, "b", "c", "d", "e", "f", "x".repeat(300)]);
    expect(out).toEqual(["a", "b", "c", "d", "e"]);
    expect(cleanFitCriteria("not a list")).toEqual([]);
    expect(cleanFitCriteria(["y".repeat(300)])[0]).toHaveLength(120);
  });
});

describe("gateModeFor", () => {
  it("never judges roles in a company search", () => {
    expect(gateModeFor({ companyOnly: true }, "enforce")).toBe("off");
    expect(gateModeFor({ companyOnly: false }, "enforce")).toBe("enforce");
    expect(gateModeFor({}, "log")).toBe("log");
  });
});

describe("a title the search asked for is not dropped on role alone", () => {
  const verdicts = new Map<string, GateResult>([
    ["hr", { verdict: "no", reason: "not an HR role", basis: "role" }],
    ["nurse", { verdict: "no", reason: "wrong field", basis: "role" }],
    ["baker", { verdict: "no", reason: "not a SaaS company", basis: "company" }],
  ]);
  const hrPeople = [
    { id: "hr", title: "Head of People" },
    { id: "nurse", title: "Nurse Manager" },
    { id: "baker", title: "Founder" },
  ];
  const searchTitles = ["HR Manager", "Head of People", "Founder"];

  it("overrules a role-based no on an exact title, never a company-based one", () => {
    const { kept, rejected, protectedCount } = applyRelevanceGate(hrPeople, verdicts, "enforce", searchTitles);
    expect(kept.map((p) => p.id)).toEqual(["hr"]);
    expect(rejected.map((p) => p.id)).toEqual(["nurse", "baker"]);
    expect(protectedCount).toBe(1);
  });

  it("only protects exact titles", () => {
    expect(titleMatchesSearch("Nurse Manager", searchTitles)).toBe(false);
    // A loose search title like "Head of" must not protect every Head of anything.
    expect(titleMatchesSearch("Head of HR", ["Head of"])).toBe(false);
    expect(titleMatchesSearch("head of people", searchTitles)).toBe(true);
  });

  it("reads basis from the model only for a no", async () => {
    aiChat.mockResolvedValueOnce(
      reply([
        { id: "a", verdict: "match", basis: "role" } as never,
        { id: "b", verdict: "no", basis: "company" } as never,
      ])
    );
    const result = await judgeRelevance(people, context, { searchId: "s9" });
    expect(result.get("a")?.basis).toBeUndefined();
    expect(result.get("b")?.basis).toBe("company");
  });
});
