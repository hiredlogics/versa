import { describe, expect, it } from "vitest";
import { applyStrictRequestedRole, filterByRequestedRole, requestedRoleFromPrompt } from "@/lib/role-policy";
import type { SearchCriteria } from "@/lib/types";

describe("strict requested-role matching", () => {
  const prompt = "I want 20 data engineers from Georgia";

  it("extracts a plural requested role", () => {
    expect(requestedRoleFromPrompt(prompt)).toBe("data engineer");
  });

  it("extracts the direct role-in-city prompt form", () => {
    expect(requestedRoleFromPrompt("Flask Developer in Chicago, IL")).toBe("flask developer");
  });

  it("keeps seniority variants of the requested role", () => {
    const results = filterByRequestedRole([{ title: "Senior Data Engineer" }], prompt);
    expect(results).toHaveLength(1);
  });

  it("rejects adjacent occupations", () => {
    const results = filterByRequestedRole(
      [
        { title: "Data Engineer" },
        { title: "Data Scientist" },
        { title: "Data Analyst" },
        { title: "Analytics Engineer" },
      ],
      prompt
    );
    expect(results.map((result) => result.title)).toEqual(["Data Engineer"]);
  });

  it("disables Apollo similar-title expansion for an explicit role", () => {
    const criteria: SearchCriteria = {
      industry: "Any",
      country: "United States",
      companySizeMin: 1,
      companySizeMax: 500,
      jobTitles: ["Data Engineer", "Data Scientist"],
      summary: "test",
      apollo: {
        personTitles: ["Data Engineer", "Data Scientist"],
        personLocations: ["Georgia"],
        includeSimilarTitles: true,
      },
    };
    const result = applyStrictRequestedRole(criteria, prompt);
    expect(result.apollo?.personTitles).toEqual(["Data Engineer"]);
    expect(result.apollo?.includeSimilarTitles).toBe(false);
  });

  it("overrides an incorrect AI title with the direct user request", () => {
    const criteria: SearchCriteria = {
      industry: "Technology",
      country: "United States",
      companySizeMin: 1,
      companySizeMax: 500,
      jobTitles: ["Data Engineer"],
      summary: "test",
      apollo: { personTitles: ["Data Engineer"], personLocations: ["Chicago"], includeSimilarTitles: true },
    };
    const result = applyStrictRequestedRole(criteria, "Flask Developer in Chicago, IL");
    expect(result.apollo?.personTitles).toEqual(["Flask Developer"]);
    expect(result.jobTitles).toEqual(["Flask Developer"]);
  });

  it("does not add default B2B company filters to a role-and-city search", () => {
    const criteria: SearchCriteria = {
      industry: "Technology",
      country: "United States",
      companySizeMin: 11,
      companySizeMax: 500,
      jobTitles: ["Video Editor"],
      summary: "test",
      apollo: {
        personTitles: ["Video Editor"],
        personLocations: ["Austin"],
        qKeywords: "technology",
        employeeRanges: ["11,50", "51,200"],
      },
    };
    const result = applyStrictRequestedRole(criteria, "Find 10 video editors in Austin, Texas");
    expect(result.industry).toBe("Any");
    expect(result.apollo?.qKeywords).toBeUndefined();
    expect(result.apollo?.employeeRanges).toBeUndefined();
  });
});
