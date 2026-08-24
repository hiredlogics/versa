import { beforeEach, describe, expect, it, vi } from "vitest";

const aiChat = vi.fn();
vi.mock("@/lib/services/ai/aiRouter", () => ({ aiChat: (...args: unknown[]) => aiChat(...args) }));

const { CHUNK_SIZE, CONCURRENCY, buildUserPrompt, templateWhy, writeWhy } = await import(
  "@/lib/pipeline/why"
);
import type { Brief, VerifiedLead } from "@/lib/pipeline/types";

const brief: Brief = {
  intent: "HR managers at software firms in Toronto",
  titles: ["HR Manager"],
  location: "Toronto",
  industry: "software",
  employeeRanges: ["51,200"],
  signals: ["hiring now"],
  excludeTitles: [],
  excludeIndustries: [],
  requestedTotal: 100,
};

function lead(id: string, overrides: Partial<VerifiedLead["candidate"]> = {}): VerifiedLead {
  return {
    candidate: {
      providerId: id,
      name: `Person ${id}`,
      title: "HR Manager",
      company: "Acme Software",
      industry: "software",
      employees: 120,
      location: "Toronto, Ontario, Canada",
      linkedinUrl: null,
      emailLikely: true,
      headline: null,
      ...overrides,
    },
    fit: 70,
    email: `${id}@acme.com`,
    emailStatus: "verified",
  };
}

function respond(entries: Array<{ id: string; why: string }>) {
  aiChat.mockResolvedValueOnce({
    content: JSON.stringify({ leads: entries }),
    provider: "OPENAI",
  });
}

const GOOD_WHY = "Runs people ops at a 120-person software firm in Toronto and owns hiring budget.";

beforeEach(() => aiChat.mockReset());

describe("the vendor boundary", () => {
  it("keeps the provider name out of the assembled prompt", () => {
    // This ships in the CSV, which outlives the UI and cannot be patched once
    // a customer has forwarded it.
    const prompt = buildUserPrompt([lead("a"), lead("b")], brief);
    expect(prompt.toLowerCase()).not.toContain("apollo");
  });

  it("sends only the six permitted fields", async () => {
    respond([{ id: "a", why: GOOD_WHY }]);
    await writeWhy([lead("a")], brief);

    const sent = JSON.parse(
      aiChat.mock.calls[0][0].user.split("People:\n")[1]
    ) as Array<Record<string, unknown>>;

    expect(Object.keys(sent[0]).sort()).toEqual([
      "company",
      "employees",
      "id",
      "industry",
      "location",
      "title",
    ]);
    const wholeCall = JSON.stringify(aiChat.mock.calls[0][0]).toLowerCase();
    expect(wholeCall).not.toContain("apollo");
    expect(wholeCall).not.toContain("@acme.com");
  });
});

describe("matching by id", () => {
  it("attaches each why to the person it belongs to, whatever the order", () => {
    // A reordered response would otherwise give every lead a plausible reason
    // about somebody else.
    respond([
      { id: "c", why: `${GOOD_WHY} C` },
      { id: "a", why: `${GOOD_WHY} A` },
      { id: "b", why: `${GOOD_WHY} B` },
    ]);

    return writeWhy([lead("a"), lead("b"), lead("c")], brief).then((result) => {
      expect(result[0].why).toContain("A");
      expect(result[1].why).toContain("B");
      expect(result[2].why).toContain("C");
    });
  });

  it("ignores an id it never sent", async () => {
    respond([
      { id: "a", why: `${GOOD_WHY} A` },
      { id: "ghost", why: `${GOOD_WHY} ghost` },
    ]);

    const result = await writeWhy([lead("a"), lead("b")], brief);

    expect(result[0].whySource).toBe("AI");
    expect(result[1].whySource).toBe("TEMPLATE");
    expect(result[1].why).not.toContain("ghost");
  });

  it("templates the leads a short response left out", async () => {
    respond([{ id: "a", why: GOOD_WHY }]);

    const result = await writeWhy([lead("a"), lead("b"), lead("c")], brief);

    expect(result.map((r) => r.whySource)).toEqual(["AI", "TEMPLATE", "TEMPLATE"]);
    expect(result.every((r) => (r.why ?? "").length > 0)).toBe(true);
  });
});

describe("quality gates", () => {
  it("rejects filler and falls back to the template", async () => {
    respond([
      { id: "a", why: "Good fit for your search" },
      { id: "b", why: "Matches your criteria and is a relevant role" },
    ]);

    const result = await writeWhy([lead("a"), lead("b")], brief);

    expect(result.map((r) => r.whySource)).toEqual(["TEMPLATE", "TEMPLATE"]);
    expect(result[0].why).toContain("Acme Software");
  });

  it("rejects a why shorter than 30 characters", async () => {
    respond([{ id: "a", why: "Solid lead." }]);
    const result = await writeWhy([lead("a")], brief);
    expect(result[0].whySource).toBe("TEMPLATE");
  });
});

describe("failure handling", () => {
  it("gives every lead a why when the chunk throws", async () => {
    aiChat.mockRejectedValueOnce(new Error("provider down"));

    const result = await writeWhy([lead("a"), lead("b")], brief);

    expect(result).toHaveLength(2);
    expect(result.every((r) => (r.why ?? "").length >= 30)).toBe(true);
    // Records what happened, not what was attempted.
    expect(result.every((r) => r.whySource === "TEMPLATE")).toBe(true);
  });

  it("survives unparseable JSON", async () => {
    aiChat.mockResolvedValueOnce({ content: "<html>502</html>", provider: "OPENAI" });
    const result = await writeWhy([lead("a")], brief);
    expect(result[0].whySource).toBe("TEMPLATE");
  });

  it("names the company in the template", () => {
    const text = templateWhy(lead("a"), brief);
    expect(text).toContain("Acme Software");
    expect(text.length).toBeGreaterThanOrEqual(30);
    expect(text.toLowerCase()).not.toContain("apollo");
  });
});

describe("chunking", () => {
  it("splits into chunks of 25 and keeps every lead", async () => {
    const leads = Array.from({ length: 60 }, (_, i) => lead(`p${i}`));
    for (let i = 0; i < 3; i++) respond([]);

    const result = await writeWhy(leads, brief);

    expect(aiChat).toHaveBeenCalledTimes(Math.ceil(60 / CHUNK_SIZE));
    expect(result).toHaveLength(60);
    expect(result.every((r) => (r.why ?? "").length > 0)).toBe(true);
  });

  it("runs no more than four calls at once", async () => {
    let active = 0;
    let peak = 0;
    aiChat.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { content: JSON.stringify({ leads: [] }), provider: "OPENAI" };
    });

    await writeWhy(
      Array.from({ length: CHUNK_SIZE * 6 }, (_, i) => lead(`p${i}`)),
      brief
    );

    expect(peak).toBeLessThanOrEqual(CONCURRENCY);
  });

  it("does nothing for an empty list", async () => {
    expect(await writeWhy([], brief)).toEqual([]);
    expect(aiChat).not.toHaveBeenCalled();
  });
});
