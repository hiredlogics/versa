import { describe, it, expect } from "vitest";
import { parsedSearchCriteriaSchema, findLeadsInputSchema } from "@/lib/validations/search-criteria";
import { normalizeLocations, splitKeywordsForApollo } from "@/lib/search-criteria";

describe("search criteria validation", () => {
  it("validates find leads input", () => {
    const result = findLeadsInputSchema.parse({
      prompt: "Find SaaS CEOs in the US",
      inputType: "prompt",
    });
    expect(result.prompt).toContain("SaaS");
  });

  it("parses structured criteria shape", () => {
    const result = parsedSearchCriteriaSchema.parse({
      industry: "SaaS",
      country: "United States",
      companySizeMin: 10,
      companySizeMax: 500,
      jobTitles: ["CEO"],
      seniorityLevels: [],
      keywords: ["software"],
      companyNames: [],
      companyDomains: [],
      linkedinUrls: [],
      intentSummary: "SaaS CEOs in the US",
    });
    expect(result.intentSummary).toBeTruthy();
  });
});

describe("search-criteria helpers", () => {
  it("normalizes duplicate locations to most specific", () => {
    expect(normalizeLocations(["California", "United States"])).toEqual(["California"]);
  });

  it("coerces string personLocations from ChatGPT without crashing", async () => {
    const { normalizeSearchCriteria, asStringArray } = await import("@/lib/search-criteria");
    expect(asStringArray("United States")).toEqual(["United States"]);
    expect(asStringArray("California, Texas")).toEqual(["California", "Texas"]);

    const criteria = normalizeSearchCriteria(
      {
        industry: "SaaS",
        country: "United States",
        companySizeMin: 10,
        companySizeMax: 200,
        jobTitles: ["CEO"],
        summary: "SaaS CEOs",
        apollo: {
          // ChatGPT sometimes returns a string instead of an array
          personTitles: "CEO, Founder" as unknown as string[],
          personLocations: "United States" as unknown as string[],
          qKeywords: "saas",
        },
      } as never,
      "Find SaaS CEOs in the US"
    );

    expect(criteria.apollo?.personLocations).toEqual(["United States"]);
    expect(criteria.apollo?.personTitles).toEqual(["CEO", "Founder"]);
  });

  it("normalizes hyphen employee ranges for Apollo", async () => {
    const { normalizeEmployeeRanges, normalizeSearchCriteria } = await import(
      "@/lib/search-criteria"
    );
    expect(normalizeEmployeeRanges(["20-43"])).toEqual(["20,43"]);
    expect(normalizeEmployeeRanges(["11,50", "bad"])).toEqual(["11,50"]);

    const criteria = normalizeSearchCriteria(
      {
        industry: "SaaS",
        country: "United States",
        companySizeMin: 20,
        companySizeMax: 50,
        jobTitles: ["CEO"],
        summary: "test",
        apollo: {
          personTitles: ["CEO"],
          personLocations: ["United States"],
          employeeRanges: ["20-43"] as unknown as string[],
        },
      } as never,
      "Find CEOs"
    );
    expect(criteria.apollo?.employeeRanges).toEqual(["20,43"]);
  });

  it("splits long keywords for Apollo", () => {
    const { apolloKeywords, searchIntent } = splitKeywordsForApollo(
      "e-commerce marketing automation AI",
      "marketing directors"
    );
    expect(apolloKeywords).toBe("e-commerce marketing");
    expect(searchIntent).toContain("automation");
  });
});

describe("priority mapping", () => {
  it("maps score to priority bands", async () => {
    const { toDbPriority } = await import("@/lib/services/ai/scoreLead");
    expect(toDbPriority("Very High")).toBe("VERY_HIGH");
    expect(toDbPriority("High")).toBe("HIGH");
  });
});
