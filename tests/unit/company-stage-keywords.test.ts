import { describe, it, expect } from "vitest";
import { normalizeSearchCriteria, resolveApolloKeywords } from "@/lib/search-criteria";

describe("company stage words never reach q_keywords", () => {
  it("drops 'startups' so Apollo does not match company names", () => {
    // Real failure: q_keywords "startups" returned "University Startups",
    // "Make Startups", "Chucktown Startups" instead of actual startups.
    const { apolloKeywords } = resolveApolloKeywords({
      qKeywords: "startups",
      searchIntent: "AI startups",
    });
    expect(apolloKeywords).toBeUndefined();
  });

  it("keeps the real domain when it is mixed with a stage word", () => {
    const { apolloKeywords } = resolveApolloKeywords({
      qKeywords: "healthcare startups",
      searchIntent: "healthcare startups",
    });
    expect(apolloKeywords).toBe("healthcare");
  });

  it("strips stage words coming from the industry field too", () => {
    const { apolloKeywords } = resolveApolloKeywords({
      qKeywords: "",
      industry: "Startups",
      searchIntent: "AI startups",
    });
    expect(apolloKeywords).toBeUndefined();
  });

  it("turns 'startup' into startup-sized headcount instead of a keyword", () => {
    const criteria = normalizeSearchCriteria(
      {
        industry: "Software",
        country: "United States",
        companySizeMin: 1,
        companySizeMax: 1000,
        jobTitles: ["Founder"],
        summary: "AI startup founders",
        apollo: {
          personTitles: ["Founder", "CEO"],
          personLocations: ["United States"],
          qKeywords: "startups",
          employeeRanges: ["1,10", "11,50", "51,200", "201,500", "501,1000"],
        },
      } as never,
      "AI startups"
    );

    expect(criteria.apollo?.qKeywords ?? "").not.toMatch(/startup/i);
    expect(criteria.apollo?.employeeRanges).toEqual(["1,10", "11,50"]);
  });
});
