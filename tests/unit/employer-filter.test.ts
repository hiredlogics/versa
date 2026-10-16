import { describe, it, expect } from "vitest";
import {
  buildApolloSearchVariants,
  normalizeDomains,
  normalizeSearchCriteria,
} from "@/lib/search-criteria";

function parseAtApple() {
  return normalizeSearchCriteria(
    {
      industry: "Information Technology",
      country: "United States",
      companySizeMin: 1001,
      companySizeMax: 5000,
      jobTitles: ["Software Engineer"],
      summary: "Software engineers at Apple",
      companyDomains: ["apple.com"],
      apollo: {
        personTitles: ["Software Engineer", "Developer"],
        personLocations: ["United States"],
        qKeywords: "information technology",
        employeeRanges: ["1001,5000"],
      },
    } as never,
    "people who work at Apple but are looking for jobs"
  );
}

describe("employer targeting", () => {
  it("cleans domains from whatever shape the AI returns", () => {
    expect(normalizeDomains(["https://www.Apple.com/jobs", "apple.com", "stripe.com"])).toEqual([
      "apple.com",
      "stripe.com",
    ]);
    expect(normalizeDomains(["Apple"])).toEqual([]);
  });

  it("sends the employer to Apollo instead of dropping it", () => {
    // Real failure: "people who work at Apple" returned staff at Raya, FORTNA,
    // RAYUS Radiology: the employer was parsed and then discarded.
    expect(parseAtApple().apollo?.organizationDomains).toEqual(["apple.com"]);
  });

  it("drops size and industry guesses that would exclude the employer", () => {
    // Apple has ~160k staff, so an "1001,5000" bucket would rule it out.
    const apollo = parseAtApple().apollo;
    expect(apollo?.employeeRanges).toBeUndefined();
    expect(apollo?.qKeywords).toBeUndefined();
  });

  it("keeps the employer pinned through every relax variant", () => {
    const variants = buildApolloSearchVariants(parseAtApple());
    expect(variants.length).toBeGreaterThan(1);
    for (const variant of variants) {
      expect(variant.filters.organizationDomains).toEqual(["apple.com"]);
    }
  });

  it("leaves normal searches untouched", () => {
    const criteria = normalizeSearchCriteria(
      {
        industry: "Software",
        country: "United States",
        companySizeMin: 11,
        companySizeMax: 200,
        jobTitles: ["CEO"],
        summary: "SaaS CEOs",
        apollo: {
          personTitles: ["CEO"],
          personLocations: ["United States"],
          qKeywords: "saas",
          employeeRanges: ["11,50"],
        },
      } as never,
      "SaaS CEOs in the US"
    );

    expect(criteria.apollo?.organizationDomains).toBeUndefined();
    expect(criteria.apollo?.qKeywords).toBe("saas");
  });
});
