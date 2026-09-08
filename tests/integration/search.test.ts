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

  it("keeps several sibling regions the user asked for", () => {
    expect(normalizeLocations(["New York", "California"])).toEqual(["New York", "California"]);
    expect(normalizeLocations(["NY", "new york", "Texas"])).toEqual(["New York", "Texas"]);
    expect(normalizeLocations(["New York", "Texas", "Florida", "Ohio"])).toHaveLength(3);
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

  it("stabilizes software engineer title synonyms across AI runs", async () => {
    const { normalizeSoftwareEngineerTitles, SOFTWARE_ENGINEER_TITLES } = await import(
      "@/lib/search-criteria"
    );

    const runA = normalizeSoftwareEngineerTitles(
      ["Software Engineer", "Developer", "Programmer", "Technical Lead", "Engineering Manager"],
      "Find software engineers in California who are open to work"
    );
    const runB = normalizeSoftwareEngineerTitles(
      ["Software Engineer", "Developer", "Programmer", "Technical Lead", "Software Architect"],
      "Find software engineers in California who are open to work"
    );

    expect(runA).toEqual(SOFTWARE_ENGINEER_TITLES);
    expect(runB).toEqual(SOFTWARE_ENGINEER_TITLES);
    expect(runA).toEqual(runB);
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

  it("keeps NY HR open-to-work filters tight (no keyword drop / no engineer fallback)", () => {
    const prompt =
      "please find those people who is looking open to work please those in the NY HR";
    const criteria = normalizeSearchCriteria(
      {
        industry: "Human Resources",
        country: "New York",
        companySizeMin: 10,
        companySizeMax: 500,
        openToWork: true,
        summary: "NY HR open to work",
        searchIntent: "HR professionals in New York who may be open to work",
        apollo: {
          personTitles: ["HR"],
          personLocations: ["NY"],
          qKeywords: "human resources",
          employeeRanges: ["11,50", "51,200", "201,500"],
        },
      } as never,
      prompt
    );

    expect(criteria.openToWork).toBe(true);
    expect(criteria.apollo?.personLocations).toEqual(["New York"]);
    expect(criteria.apollo?.qKeywords?.toLowerCase()).toContain("open to work");
    expect(criteria.apollo?.includeSimilarTitles).toBe(false);
    expect(criteria.apollo?.personTitles?.some((t) => /hr|people|human resources|talent/i.test(t))).toBe(
      true
    );
    expect(criteria.apollo?.personTitles?.join(" ")).not.toMatch(/Software Engineer/i);
    expect(criteria.apollo?.employeeRanges).not.toContain("501,1000");
    // Client-facing copy must stay provider-neutral while explaining strict OTW keep.
    expect(criteria.searchIntent?.toLowerCase()).toContain(
      "only people with open-to-work / job-seeking wording"
    );
    expect(criteria.searchIntent?.toLowerCase()).not.toContain("apollo");
  });

  it("builds multiple OTW-biased Apollo variants (does not stop at a 1-hit pool)", () => {
    const criteria = normalizeSearchCriteria(
      {
        industry: "Software",
        country: "California",
        companySizeMin: 10,
        companySizeMax: 500,
        openToWork: true,
        summary: "SE CA open to work",
        apollo: {
          personTitles: ["Software Engineer"],
          personLocations: ["California"],
          qKeywords: "open to work",
          employeeRanges: ["11,50", "51,200", "201,500"],
        },
      } as never,
      "software engineers in California open to work"
    );
    const variants = buildApolloSearchVariants(criteria);
    expect(variants.length).toBeGreaterThan(3);
    expect(variants.some((v) => /seeking opportunities/i.test(v.filters.qKeywords || ""))).toBe(
      true
    );
    expect(
      variants.some((v) =>
        (v.filters.personTitles || []).some((t) => /open to work/i.test(t))
      )
    ).toBe(true);
    // No giant "titles only" fallback that returns employed people with no signals
    expect(
      variants.every(
        (v) =>
          Boolean(v.filters.qKeywords) ||
          (v.filters.personTitles || []).some((t) => /open to work|seeking|looking/i.test(t))
      )
    ).toBe(true);
  });
});

describe("open-to-work title signals", () => {
  it("hard-filters to title signals when present; soft keeps batch, strict drops all", async () => {
    const { filterPeopleForOpenToWork, hasOpenToWorkTitleSignal } = await import(
      "@/lib/open-to-work"
    );
    expect(hasOpenToWorkTitleSignal("Engineer #OpenToWork")).toBe(true);
    expect(hasOpenToWorkTitleSignal("HR Manager")).toBe(false);
    expect(
      hasOpenToWorkTitleSignal({ title: "Engineer", headline: "Actively looking for a new role" })
    ).toBe(true);

    const hard = filterPeopleForOpenToWork([
      { title: "HR Manager" },
      { title: "Recruiter — Open to Work" },
    ]);
    expect(hard.usedTitleSignals).toBe(true);
    expect(hard.people).toHaveLength(1);

    const soft = filterPeopleForOpenToWork([{ title: "HR Manager" }, { title: "CHRO" }]);
    expect(soft.usedTitleSignals).toBe(false);
    expect(soft.people).toHaveLength(2);

    const strict = filterPeopleForOpenToWork([{ title: "HR Manager" }, { title: "CHRO" }], {
      strict: true,
    });
    expect(strict.usedTitleSignals).toBe(false);
    expect(strict.people).toHaveLength(0);
    expect(strict.scanned).toBe(2);
  });
});

describe("priority mapping", () => {
  it("maps score to priority bands", async () => {
    const { toDbPriority } = await import("@/lib/services/ai/scoreLead");
    expect(toDbPriority("Very High")).toBe("VERY_HIGH");
    expect(toDbPriority("High")).toBe("HIGH");
  });
});
