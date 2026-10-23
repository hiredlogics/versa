import { describe, expect, it } from "vitest";
import { buildApolloSearchVariants, industryToKeywordTags } from "@/lib/search-criteria";
import type { SearchCriteria } from "@/lib/types";

function criteriaFor(industry: string, extra: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    industry,
    country: "United States",
    companySizeMin: 50,
    companySizeMax: 200,
    jobTitles: ["Head of Sales", "VP of Sales"],
    summary: "test",
    searchIntent: "heads of sales",
    apollo: {
      personTitles: ["Head of Sales", "VP of Sales"],
      personLocations: ["United States"],
      employeeRanges: ["51,200"],
      includeSimilarTitles: true,
    },
    ...extra,
  } as SearchCriteria;
}

describe("industryToKeywordTags", () => {
  it("turns a parsed industry into lowercase Apollo keyword tags", () => {
    expect(industryToKeywordTags("Software")).toEqual(["software"]);
    expect(industryToKeywordTags("Real Estate / PropTech")).toEqual(["real estate", "proptech"]);
    expect(industryToKeywordTags("Healthcare and Life Sciences")).toEqual([
      "healthcare",
      "life sciences",
    ]);
  });

  it("omits the filter when no real industry was parsed", () => {
    expect(industryToKeywordTags("Any")).toBeUndefined();
    expect(industryToKeywordTags("N/A")).toBeUndefined();
    expect(industryToKeywordTags("")).toBeUndefined();
    expect(industryToKeywordTags(undefined)).toBeUndefined();
  });
});

describe("buildApolloSearchVariants industry tags", () => {
  it("sends the industry to Apollo and keeps it through the relax levels", () => {
    const variants = buildApolloSearchVariants(criteriaFor("Software"));
    expect(variants[0].filters.organizationKeywordTags).toEqual(["software"]);
    // Widening size / dropping size must not drop the industry.
    expect(variants[1].filters.organizationKeywordTags).toEqual(["software"]);
    expect(variants[2].filters.organizationKeywordTags).toEqual(["software"]);
    // Only the last-resort variant searches without the industry.
    expect(variants[variants.length - 1].filters.organizationKeywordTags).toBeUndefined();
  });

  it("never adds an industry tag when the employer is pinned", () => {
    const variants = buildApolloSearchVariants(
      criteriaFor("Technology", {
        apollo: {
          personTitles: ["Engineer"],
          personLocations: ["United States"],
          organizationDomains: ["apple.com"],
          includeSimilarTitles: true,
        },
      })
    );
    for (const variant of variants) {
      expect(variant.filters.organizationDomains).toEqual(["apple.com"]);
      expect(variant.filters.organizationKeywordTags).toBeUndefined();
    }
  });

  it("omits the tag entirely when the industry is unknown", () => {
    const variants = buildApolloSearchVariants(criteriaFor("Any"));
    expect(variants[0].filters.organizationKeywordTags).toBeUndefined();
  });
});
