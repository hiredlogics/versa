import { describe, it, expect } from "vitest";
import { parsedSearchCriteriaSchema, findLeadsInputSchema } from "@/lib/validations/search-criteria";
import {
  normalizeLocations,
  splitKeywordsForApollo,
  resolveApolloKeywords,
  normalizeEmployeeRanges,
  normalizeSearchCriteria,
  buildApolloSearchVariants,
} from "@/lib/search-criteria";

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

  it("expands US/USA aliases for Apollo", () => {
    expect(normalizeLocations(["US"])).toEqual(["United States"]);
    expect(normalizeLocations(["usa"])).toEqual(["United States"]);
  });

  it("coerces string personLocations from ChatGPT without crashing", () => {
    const criteria = normalizeSearchCriteria(
      {
        industry: "SaaS",
        country: "United States",
        companySizeMin: 10,
        companySizeMax: 200,
        jobTitles: ["CEO"],
        summary: "SaaS CEOs",
        apollo: {
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

  it("snaps invented employee ranges onto Apollo buckets", () => {
    expect(normalizeEmployeeRanges(["20-43"])).toEqual(["11,50"]);
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
    expect(criteria.apollo?.employeeRanges).toEqual(["11,50"]);
  });

  it("keeps real estate as industry keyword and moves automation into intent", () => {
    const resolved = resolveApolloKeywords({
      qKeywords: "automation, real",
      industry: "Real Estate",
      searchIntent: "people who need automation",
      userPrompt: "Need automation. people in real estate in the US",
    });

    expect(resolved.apolloKeywords).toBe("real estate");
    expect(resolved.searchIntent.toLowerCase()).toContain("automation");

    const criteria = normalizeSearchCriteria(
      {
        industry: "Real Estate",
        country: "United States",
        companySizeMin: 11,
        companySizeMax: 50,
        summary: "Real estate automation buyers",
        searchIntent: "Decision makers at real estate companies needing automation",
        apollo: {
          personTitles: ["Broker", "Property Manager", "Founder", "CEO"],
          personLocations: ["United States"],
          qKeywords: "automation, real",
          employeeRanges: ["11,50"],
        },
      } as never,
      "Need automation. people in real estate in the US"
    );

    expect(criteria.apollo?.qKeywords).toBe("real estate");
    expect(criteria.searchIntent?.toLowerCase()).toMatch(/automation|real estate/);
    expect(criteria.apollo?.personTitles?.[0]).toBe("Broker");
  });

  it("replaces tech titles when industry is real estate", () => {
    const criteria = normalizeSearchCriteria(
      {
        industry: "Real Estate",
        country: "United States",
        companySizeMin: 11,
        companySizeMax: 50,
        summary: "real estate",
        searchIntent: "real estate automation",
        apollo: {
          personTitles: ["Founder", "CEO", "CTO", "VP Engineering"],
          personLocations: ["United States"],
          qKeywords: "real estate",
          employeeRanges: ["11,50"],
        },
      } as never,
      "Need automation in real estate"
    );

    expect(criteria.apollo?.personTitles).not.toContain("CTO");
    expect(criteria.apollo?.personTitles).not.toContain("VP Engineering");
    expect(criteria.apollo?.personTitles?.some((t) => /broker|property/i.test(t))).toBe(true);
  });

  it("keeps industry keyword when smart-relax widens filters", () => {
    const variants = buildApolloSearchVariants({
      industry: "Real Estate",
      country: "United States",
      companySizeMin: 11,
      companySizeMax: 50,
      jobTitles: ["Broker", "CEO", "Founder"],
      summary: "test",
      searchIntent: "real estate automation",
      apollo: {
        personTitles: ["Broker", "Property Manager", "Founder", "CEO"],
        personLocations: ["United States"],
        qKeywords: "real estate",
        employeeRanges: ["11,50"],
        includeSimilarTitles: true,
      },
    });

    expect(variants[0].filters.qKeywords).toBe("real estate");
    expect(variants[1].filters.qKeywords).toBe("real estate");
    expect(variants[2].filters.qKeywords).toBe("real estate");
    // Last variant may drop keyword only as last resort
    expect(variants[variants.length - 1].filters.qKeywords).toBeUndefined();
  });

  it("moves need-words out of long keyword blobs", () => {
    const { apolloKeywords, searchIntent } = splitKeywordsForApollo(
      "e-commerce marketing automation AI",
      "marketing directors"
    );
    expect(apolloKeywords).toBe("e-commerce");
    expect(searchIntent.toLowerCase()).toMatch(/automation|ai|marketing/);
  });
});

describe("priority mapping", () => {
  it("maps score to priority bands", async () => {
    const { toDbPriority } = await import("@/lib/services/ai/scoreLead");
    expect(toDbPriority("Very High")).toBe("VERY_HIGH");
    expect(toDbPriority("High")).toBe("HIGH");
  });
});
