import { describe, it, expect, beforeEach } from "vitest";
import {
  onboardingContextCompleteSchema,
  contextSummaryLine,
  type UserLeadContextDTO,
} from "@/lib/validations/onboarding-context";
import {
  clearContextCache,
  getCachedUserLeadContext,
  setCachedUserLeadContext,
} from "@/lib/cache/contextCache";
import {
  applyExclusionScoreCap,
  titleMatchesExcluded,
  promptExplicitlyRequestsTitle,
} from "@/lib/context/exclusions";

describe("onboarding context validation", () => {
  it("validates complete onboarding payload", () => {
    const result = onboardingContextCompleteSchema.parse({
      businessDescription: "We sell AI automation for SaaS companies",
      targetIndustries: ["SaaS"],
      targetCountries: ["United States"],
      companySizeMin: 20,
      companySizeMax: 500,
      targetTitles: ["CEO"],
      servicesToSell: ["AI automation"],
      minLeadScore: 8,
    });
    expect(result.businessDescription).toContain("AI automation");
  });

  it("rejects invalid company size range", () => {
    expect(() =>
      onboardingContextCompleteSchema.parse({
        businessDescription: "We sell AI automation for SaaS companies",
        targetIndustries: ["SaaS"],
        targetCountries: ["United States"],
        companySizeMin: 500,
        companySizeMax: 20,
        targetTitles: ["CEO"],
        servicesToSell: ["AI automation"],
      })
    ).toThrow();
  });
});

describe("context cache", () => {
  beforeEach(() => clearContextCache());

  it("stores and retrieves cached context", () => {
    const dto: UserLeadContextDTO = {
      id: "1",
      userId: "u1",
      companyName: null,
      websiteUrl: null,
      businessDescription: "Test",
      targetMarket: null,
      mainOffer: null,
      targetIndustries: ["SaaS"],
      targetCountries: ["United States"],
      companySizeMin: 20,
      companySizeMax: 500,
      targetTitles: ["CEO"],
      targetSeniorities: [],
      excludedIndustries: [],
      excludedTitles: ["Intern"],
      preferredBuyingSignals: [],
      highQualityLeadNotes: null,
      badLeadNotes: null,
      preferredOutreachAngle: null,
      servicesToSell: ["AI automation"],
      minLeadScore: 8,
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCachedUserLeadContext("u1", dto);
    expect(getCachedUserLeadContext("u1")?.businessDescription).toBe("Test");
  });
});

describe("exclusion scoring", () => {
  it("caps score for excluded titles", () => {
    const capped = applyExclusionScoreCap(
      9,
      { title: "Software Engineer", industry: "SaaS" },
      ["Software Engineer"],
      [],
      "find me automation leads"
    );
    expect(capped).toBeLessThanOrEqual(5);
  });

  it("does not cap when prompt explicitly requests title", () => {
    expect(
      promptExplicitlyRequestsTitle("find software engineers", "Software Engineer", [
        "Software Engineer",
      ])
    ).toBe(true);
    const capped = applyExclusionScoreCap(
      9,
      { title: "Software Engineer", industry: "SaaS" },
      ["Software Engineer"],
      [],
      "find software engineers"
    );
    expect(capped).toBe(9);
  });

  it("matches excluded titles", () => {
    expect(titleMatchesExcluded("Junior Software Engineer", ["Software Engineer"])).toBe(true);
  });
});

describe("contextSummaryLine", () => {
  it("builds summary from context", () => {
    const line = contextSummaryLine({
      id: "1",
      userId: "u1",
      companyName: null,
      websiteUrl: null,
      businessDescription: "x",
      targetMarket: null,
      mainOffer: null,
      targetIndustries: ["SaaS", "Healthcare"],
      targetCountries: ["United States"],
      companySizeMin: 20,
      companySizeMax: 500,
      targetTitles: ["CEO", "CTO"],
      targetSeniorities: [],
      excludedIndustries: [],
      excludedTitles: [],
      preferredBuyingSignals: [],
      highQualityLeadNotes: null,
      badLeadNotes: null,
      preferredOutreachAngle: null,
      servicesToSell: [],
      minLeadScore: 8,
      onboardingCompleted: true,
      createdAt: "",
      updatedAt: "",
    });
    expect(line).toContain("SaaS");
    expect(line).toContain("CEO");
  });
});
