import { describe, expect, it } from "vitest";
import { asksForSeniority, heuristicScoreLead, titleRoleFit } from "@/lib/heuristic-scoring";
import { dropContradictions } from "@/lib/services/ai/scoreLead";
import { fitForLead } from "@/lib/services/ai/relevanceGate";
import type { LeadScoreContext } from "@/lib/types";

const base = {
  name: "Sam Lee",
  company: "Shopify",
  industry: "retail",
  employees: 300,
  location: "Toronto, Canada",
  hasEmail: true,
};

const dataSearch: LeadScoreContext = {
  originalPrompt: "Data engineering developers in Canada",
  searchIntent: "Data engineers in Canada",
  targetTitles: ["Data Engineer", "Senior Data Engineer", "Big Data Engineer"],
};

describe("backup scoring rewards the role asked for, not seniority", () => {
  it("scores a Data Engineer above a CTO for a data engineering search", () => {
    const engineer = heuristicScoreLead({ ...base, title: "Data Engineer" }, dataSearch);
    const cto = heuristicScoreLead({ ...base, title: "CTO" }, dataSearch);
    expect(engineer.score).toBeGreaterThan(cto.score);
    expect(engineer.pros).toContain("Title matches the role you searched for");
    expect(cto.cons).toContain("Title is not one of the roles you searched for");
  });

  it("never calls a missing leader title a con when leaders were not asked for", () => {
    const engineer = heuristicScoreLead({ ...base, title: "Data Engineer" }, dataSearch);
    expect((engineer.cons ?? []).join(" ")).not.toMatch(/decision maker|senior title/i);
  });

  it("still rewards leaders when the prompt asks for them", () => {
    const leaders: LeadScoreContext = {
      originalPrompt: "Founders and CEOs of SaaS companies",
      targetTitles: ["Founder", "CEO"],
    };
    const ceo = heuristicScoreLead({ ...base, title: "CEO" }, leaders);
    const analyst = heuristicScoreLead({ ...base, title: "Data Analyst" }, leaders);
    expect(ceo.score).toBeGreaterThan(analyst.score);
    expect(ceo.pros).toContain("Senior title, as your search asks");
  });
});

describe("asksForSeniority", () => {
  it("is true only for leader words", () => {
    expect(asksForSeniority({ originalPrompt: "heads of payments" })).toBe(true);
    expect(asksForSeniority({ originalPrompt: "decision makers at clinics" })).toBe(true);
    expect(asksForSeniority({ originalPrompt: "Data engineering developers" })).toBe(false);
    // "HR managers" and "senior engineers" name a role, not a leader search.
    expect(asksForSeniority({ originalPrompt: "HR managers in New York" })).toBe(false);
    expect(asksForSeniority({ originalPrompt: "senior React engineers" })).toBe(false);
  });
});

describe("titleRoleFit", () => {
  it("tells exact, close and no match apart", () => {
    expect(titleRoleFit("Senior Data Engineer", ["Data Engineer"])).toBe("exact");
    expect(titleRoleFit("Data Analyst", ["Data Engineer"])).toBe("close");
    expect(titleRoleFit("Chef", ["Data Engineer"])).toBe("none");
  });
});

describe("dropContradictions", () => {
  const lead = { hasEmail: true, employees: 300, location: "Toronto", industry: "retail" };

  it("drops points the lead's data proves wrong", () => {
    const kept = dropContradictions(
      [
        "No email found",
        "Company size unknown",
        "Location is unknown",
        "Industry unknown",
        "Junior title, while top leads are senior",
      ],
      lead
    );
    expect(kept).toEqual(["Junior title, while top leads are senior"]);
  });

  it("keeps true points about missing data", () => {
    const sparse = { hasEmail: false, employees: 0, location: "", industry: "N/A" };
    const points = ["No email found", "Company size unknown", "Industry unknown"];
    expect(dropContradictions(points, sparse)).toEqual(points);
    expect(dropContradictions(["Has a verified email"], sparse)).toEqual([]);
  });
});

describe("fitForLead", () => {
  it("saves real verdicts and nothing for unknown", () => {
    expect(fitForLead({ verdict: "match", reason: "title matches request" })).toEqual({
      fitVerdict: "match",
      fitReason: "title matches request",
    });
    expect(fitForLead({ verdict: "unknown", reason: "" })).toEqual({
      fitVerdict: null,
      fitReason: null,
    });
    expect(fitForLead(undefined).fitVerdict).toBeNull();
  });

  it("turns long dashes into commas for users", () => {
    expect(fitForLead({ verdict: "partial", reason: "data role — not payments" }).fitReason).toBe(
      "data role, not payments"
    );
  });
});
