import { describe, expect, it, vi } from "vitest";
import { criteriaFromBrief, looksLikeBrief, type ParsedBrief } from "@/lib/services/ai/parseBrief";
import { buildApolloSearchVariants } from "@/lib/search-criteria";
import { extractRequestedLeadCount } from "@/lib/clarifyPrompt";

vi.mock("@/lib/services/ai/aiRouter", () => ({ aiChat: vi.fn() }));

const BRIEF = `Find relevant leads for Example Co.
About: Example Co sells synthetic motion datasets to computer vision teams and many more details here.
Target industries:
- AI fitness
- Computer vision
Target job titles:
- CTO
- Head of AI
Company size: 11 to 200 employees.
Location: United States.
Start with 20 highly relevant leads. `.padEnd(450, ".");

const parsed: ParsedBrief = {
  sellerName: "Example Co",
  offering: "Synthetic motion datasets",
  titles: ["CTO", "Head of AI"],
  seniorities: ["c_suite", "head"],
  locations: ["United States"],
  employeeMin: 11,
  employeeMax: 200,
  companyKeywordTags: ["ai fitness", "computer vision"],
  excludedTitles: ["personal trainer"],
  avoid: ["ordinary gyms"],
  goodFit: ["builds its own pose models"],
  leadCount: 20,
};

describe("briefs", () => {
  it("recognises a long structured brief but not a normal prompt", () => {
    expect(looksLikeBrief(BRIEF)).toBe(true);
    expect(looksLikeBrief("Find 20 CTOs at computer vision startups in the US")).toBe(false);
  });

  it("keeps every title, seniority, size and company tag", () => {
    const c = criteriaFromBrief(parsed)!;
    expect(c.briefSearch).toBe(true);
    expect(c.apollo?.personTitles).toEqual(["CTO", "Head of AI"]);
    expect(c.apollo?.personSeniorities).toEqual(["c_suite", "head"]);
    expect(c.apollo?.organizationKeywordTags).toEqual(["ai fitness", "computer vision"]);
    expect(c.apollo?.employeeRanges).toEqual(["11,50", "51,200"]);
    expect(c.excludedTitles).toEqual(["personal trainer"]);
    expect(c.searchIntent).toContain("Avoid: ordinary gyms");
    // Company tags are industries, so the skills line stays off.
    expect(c.keywords).toBe("");
  });

  it("is rejected without company tags", () => {
    expect(criteriaFromBrief({ ...parsed, companyKeywordTags: [] })).toBeNull();
  });

  it("widens by seniority, then company size, never dropping the company tags", () => {
    const variants = buildApolloSearchVariants(criteriaFromBrief(parsed)!);
    expect(variants.map((v) => v.filters.personTitles.length)).toEqual([2, 0, 0]);
    expect(variants[2].filters.employeeRanges).toBeUndefined();
    expect(variants.every((v) => v.filters.organizationKeywordTags?.length === 2)).toBe(true);
  });

  it("reads lead counts with words in between", () => {
    expect(extractRequestedLeadCount("Start with 20 highly relevant leads.")).toBe(20);
    expect(extractRequestedLeadCount("11 to 200 employees initially")).toBeUndefined();
    expect(extractRequestedLeadCount("20leads")).toBe(20);
  });
});
