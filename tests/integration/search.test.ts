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
