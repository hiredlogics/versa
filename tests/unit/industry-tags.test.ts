import { describe, expect, it } from "vitest";
import {
  buildApolloSearchVariants,
  expandIndustryTags,
  industryToKeywordTags,
} from "@/lib/search-criteria";
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
      qKeywords: industry,
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

describe("expandIndustryTags", () => {
  it("adds known synonyms and keeps the originals first", () => {
    expect(expandIndustryTags(["cybersecurity"])).toEqual([
      "cybersecurity",
      "cyber security",
      "information security",
      "network security",
    ]);
    expect(expandIndustryTags(["underwater basket weaving"])).toEqual(["underwater basket weaving"]);
  });
});

describe("buildApolloSearchVariants industry tags", () => {
  it("sends the industry as tags, not as the restrictive free-text keyword", () => {
    const variants = buildApolloSearchVariants(criteriaFor("Software"));
    expect(variants[0].filters.organizationKeywordTags).toEqual(["software"]);
    expect(variants[0].filters.qKeywords).toBeUndefined();
  });

  it("widens with synonyms before giving up the industry", () => {
    const variants = buildApolloSearchVariants(criteriaFor("Cybersecurity"));
    expect(variants[0].filters.organizationKeywordTags).toEqual(["cybersecurity"]);
    expect(variants[1].filters.organizationKeywordTags).toEqual(
      expect.arrayContaining(["cybersecurity", "cyber security", "information security"])
    );
    // Only the last-resort variant searches without the industry.
    const last = variants[variants.length - 1].filters;
    expect(last.organizationKeywordTags).toBeUndefined();
    expect(last.qKeywords).toBeUndefined();
  });

  it("never relaxes a company size the user asked for", () => {
    const variants = buildApolloSearchVariants(criteriaFor("Software"));
    for (const variant of variants) {
      expect(variant.filters.employeeRanges).toEqual(["51,200"]);
    }
  });

  it("may widen or drop size when the parser only guessed it", () => {
    const variants = buildApolloSearchVariants(
      criteriaFor("Software", {
        companySizeMin: 0,
        companySizeMax: 0,
        apollo: {
          personTitles: ["Head of Sales"],
          personLocations: ["United States"],
          includeSimilarTitles: true,
        },
      })
    );
    expect(variants.some((v) => v.filters.employeeRanges === undefined)).toBe(true);
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

  it("falls back to the free-text keyword when the industry is unknown", () => {
    const variants = buildApolloSearchVariants(
      criteriaFor("Any", {
        apollo: {
          personTitles: ["Head of Sales"],
          personLocations: ["United States"],
          qKeywords: "saas",
          employeeRanges: ["51,200"],
          includeSimilarTitles: true,
        },
      })
    );
    expect(variants[0].filters.organizationKeywordTags).toBeUndefined();
    expect(variants[0].filters.qKeywords).toBe("saas");
  });
});
