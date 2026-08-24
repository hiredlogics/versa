import { beforeEach, describe, expect, it, vi } from "vitest";

const aiChat = vi.fn();
vi.mock("@/lib/services/ai/aiRouter", () => ({ aiChat: (...args: unknown[]) => aiChat(...args) }));

const { actualGaps, parseQuantity, understand, DEFAULT_TOTAL, MAX_CLARIFY_ROUNDS } = await import(
  "@/lib/pipeline/understand"
);

function reply(body: unknown) {
  aiChat.mockResolvedValueOnce({ content: JSON.stringify(body), provider: "OPENAI" });
}

const COMPLETE_BRIEF = {
  intent: "HR managers in Toronto",
  titles: ["HR Manager"],
  location: "Toronto",
  industry: null,
  employeeRanges: ["11,50"],
  signals: [],
  excludeTitles: [],
  excludeIndustries: [],
  requestedTotal: 100,
};

beforeEach(() => {
  aiChat.mockReset();
});

describe("the gate", () => {
  // The model is treated as hostile, not merely fallible: these all claim
  // there is nothing missing while leaving a required field empty.
  it("overrules a model claiming no gaps with a null location", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, location: null }, gaps: [], questions: [] });

    const result = await understand({ prompt: "find HR managers" });

    expect(result.status).toBe("needs_clarification");
    expect(result.status === "needs_clarification" && result.gaps).toContain("location");
  });

  it("overrules a model claiming no gaps with empty titles", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, titles: [] }, gaps: [], questions: [] });

    const result = await understand({ prompt: "find people in Toronto" });

    expect(result.status).toBe("needs_clarification");
    expect(result.status === "needs_clarification" && result.gaps).toContain("titles");
  });

  it("treats requestedTotal 0 as missing", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, requestedTotal: 0 }, gaps: [], questions: [] });

    const result = await understand({ prompt: "HR managers in Toronto" });

    expect(result.status).toBe("needs_clarification");
    expect(result.status === "needs_clarification" && result.gaps).toContain("quantity");
  });

  it("does not coerce a stringy quantity into a number", async () => {
    // A model returning "500" must not become 500 silently, nor become 0 and
    // trap the user in a loop — it is a gap, and the next round asks.
    reply({ brief: { ...COMPLETE_BRIEF, requestedTotal: "500" }, gaps: [], questions: [] });

    const result = await understand({ prompt: "HR managers in Toronto, 500" });

    expect(result.status).toBe("needs_clarification");
    expect(result.status === "needs_clarification" && result.gaps).toContain("quantity");
  });

  it("passes a genuinely complete brief", async () => {
    reply({ brief: COMPLETE_BRIEF, gaps: [], questions: [] });

    const result = await understand({ prompt: "100 HR managers in Toronto" });

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.brief.location).toBe("Toronto");
  });

  it("derives gaps directly from a brief", () => {
    expect(actualGaps({ titles: [], location: null, requestedTotal: 0 })).toEqual([
      "titles",
      "location",
      "quantity",
    ]);
    expect(actualGaps({ titles: ["CEO"], location: "Berlin", requestedTotal: 50 })).toEqual([]);
  });
});

describe("degrading safely", () => {
  it("asks when the response is not valid JSON", async () => {
    aiChat.mockResolvedValueOnce({ content: "not json at all", provider: "OPENAI" });

    const result = await understand({ prompt: "anything" });

    expect(result.status).toBe("needs_clarification");
    expect(result.status === "needs_clarification" && result.gaps).toHaveLength(3);
  });

  it("asks when field types are wrong", async () => {
    reply({ brief: { titles: "CEO", location: 42 }, gaps: [], questions: [] });

    const result = await understand({ prompt: "anything" });

    expect(result.status).toBe("needs_clarification");
  });

  it("asks when the AI call throws", async () => {
    aiChat.mockRejectedValueOnce(new Error("provider down"));

    const result = await understand({ prompt: "anything" });

    expect(result.status).toBe("needs_clarification");
  });

  it("makes exactly one AI call per invocation", async () => {
    reply({ brief: COMPLETE_BRIEF, gaps: [], questions: [] });

    await understand({ prompt: "100 HR managers in Toronto" });

    expect(aiChat).toHaveBeenCalledTimes(1);
  });
});

describe("sanitising", () => {
  it("drops invented employee buckets and dedupes titles", async () => {
    reply({
      brief: {
        ...COMPLETE_BRIEF,
        titles: ["CEO", "ceo", " CEO ", "Founder"],
        employeeRanges: ["20,43", "11-50", "11,50"],
      },
      gaps: [],
      questions: [],
    });

    const result = await understand({ prompt: "100 CEOs in Toronto" });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.brief.titles).toEqual(["CEO", "Founder"]);
    expect(result.brief.employeeRanges).toEqual(["11,50"]);
  });

  it("treats whitespace-only strings as missing", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, location: "   " }, gaps: [], questions: [] });

    const result = await understand({ prompt: "HR managers" });

    expect(result.status === "needs_clarification" && result.gaps).toContain("location");
  });

  it("caps question options at four and falls back when too few", async () => {
    reply({
      brief: { ...COMPLETE_BRIEF, location: null },
      gaps: ["location"],
      questions: [
        {
          id: "location",
          prompt: "You mentioned recruiters — which country?",
          options: ["United States", "Canada", "United Kingdom", "Germany", "France"],
        },
      ],
    });

    const result = await understand({ prompt: "recruiters" });

    if (result.status !== "needs_clarification") throw new Error("expected questions");
    const question = result.questions.find((q) => q.id === "location");
    expect(question?.options).toHaveLength(4);
    expect(question?.prompt).toContain("recruiters");
  });
});

describe("answers", () => {
  it("accepts a quantity the user typed even if the model ignores it", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, requestedTotal: 0 }, gaps: [], questions: [] });

    const result = await understand({
      prompt: "HR managers in Toronto",
      answers: { quantity: "250 leads" },
    });

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.brief.requestedTotal).toBe(250);
  });

  it("asks again for an unparseable quantity", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, requestedTotal: 0 }, gaps: [], questions: [] });

    const result = await understand({
      prompt: "HR managers in Toronto",
      answers: { quantity: "a few" },
    });

    expect(result.status).toBe("needs_clarification");
  });

  it("parses quantities from assorted shapes", () => {
    expect(parseQuantity("500")).toBe(500);
    expect(parseQuantity("1,000 leads")).toBe(1000);
    expect(parseQuantity(250)).toBe(250);
    expect(parseQuantity("a few")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(0)).toBeNull();
    expect(parseQuantity(-5)).toBeNull();
  });
});

describe("escaping the loop", () => {
  it("settles on a default quantity rather than asking forever", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, requestedTotal: 0 }, gaps: [], questions: [] });

    const result = await understand({
      prompt: "HR managers in Toronto",
      answers: { quantity: "some" },
      round: MAX_CLARIFY_ROUNDS,
    });

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.brief.requestedTotal).toBe(DEFAULT_TOTAL);
    expect(result.note).toContain(String(DEFAULT_TOTAL));
  });

  it("never invents who or where, and says so", async () => {
    reply({ brief: { ...COMPLETE_BRIEF, location: null, titles: [] }, gaps: [], questions: [] });

    const result = await understand({ prompt: "find me some people", round: MAX_CLARIFY_ROUNDS });

    expect(result.status).toBe("needs_clarification");
    if (result.status !== "needs_clarification") return;
    expect(result.exhausted).toBe(true);
    expect(result.note).toContain("job title");
  });
});
