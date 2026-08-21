import { describe, it, expect } from "vitest";
import { extractProfileSummary, toStoredApolloProfile } from "@/lib/lead-profile";
import {
  buildLeadWhyReasoning,
  extractTitleSignals,
} from "@/lib/services/ai/leadReasoning";
import type { LeadScoreContext } from "@/lib/types";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

const sampleContext = {
  companyName: "Acme AI",
  websiteUrl: "https://acme.ai",
  businessDescription: "AI automation for B2B sales teams",
  targetMarket: "Mid-market SaaS",
  mainOffer: "Lead scoring automation",
  targetIndustries: ["SaaS", "Software"],
  targetCountries: ["United States", "Canada"],
  companySizeMin: 20,
  companySizeMax: 500,
  targetTitles: ["CEO", "CTO", "VP Engineering"],
  targetSeniorities: ["c_suite", "vp"],
  excludedIndustries: [],
  excludedTitles: [],
  preferredBuyingSignals: [],
  highQualityLeadNotes: "Companies actively hiring engineers",
  badLeadNotes: null,
  preferredOutreachAngle: "Reference their recent product launch",
  servicesToSell: ["AI lead scoring", "sales automation"],
  minLeadScore: 8,
  onboardingCompleted: true,
} satisfies Omit<UserLeadContextDTO, "id" | "userId" | "createdAt" | "updatedAt">;

const scoreContext: LeadScoreContext = {
  searchIntent: "SaaS founders in the US",
  originalPrompt: "Find SaaS founders in the US with 20-300 employees",
  leadContext: { ...sampleContext, id: "ctx-1", userId: "user-1", createdAt: "", updatedAt: "" },
};

describe("extractProfileSummary", () => {
  it("combines headline and employment history", () => {
    const summary = extractProfileSummary({
      headline: "Building AI products for enterprise teams",
      employment_history: [
        { title: "CEO", organization_name: "CloudCo", current: true },
        { title: "VP Product", organization_name: "DataInc", current: false },
      ],
      seniority: "c_suite",
    });

    expect(summary).toContain("Building AI products");
    expect(summary).toContain("CEO at CloudCo (current)");
    expect(summary).toContain("Seniority: c_suite");
  });

  it("returns null when no profile fields exist", () => {
    expect(extractProfileSummary({})).toBeNull();
  });
});

describe("toStoredApolloProfile", () => {
  it("stores a trimmed profile snapshot", () => {
    const stored = toStoredApolloProfile({
      headline: "Founder",
      employment_history: [{ title: "CEO", organization_name: "TestCo", current: true }],
    });

    expect(stored).toMatchObject({
      headline: "Founder",
      employment_history: [{ title: "CEO", organization_name: "TestCo", current: true }],
    });
  });
});

describe("extractTitleSignals", () => {
  it("detects visa and stack signals from title lines", () => {
    const signals = extractTitleSignals(
      "Java | Full-stack | H1B Transfer Eligible | Open to Relocate"
    );
    expect(signals.some((s) => /visa/i.test(s))).toBe(true);
    expect(signals.some((s) => /stack/i.test(s))).toBe(true);
    expect(signals.some((s) => /relocat/i.test(s))).toBe(true);
  });
});

describe("buildLeadWhyReasoning", () => {
  it("writes a specific Why Reach Out paragraph, not score bullets", () => {
    const result = buildLeadWhyReasoning(
      {
        name: "Jane Doe",
        title: "CEO",
        company: "CloudCo",
        industry: "SaaS",
        employees: 120,
        location: "San Francisco, California, United States",
        hasEmail: true,
        leadScore: 9,
        profileSummary: "Career: CEO at CloudCo (current); VP Product at DataInc",
      },
      scoreContext
    );

    expect(result.reasoning).toContain("CEO at CloudCo");
    expect(result.reasoning).toContain("San Francisco");
    expect(result.reasoning).toMatch(/SaaS founders|ICP match|AI lead scoring/i);
    expect(result.reasoning.toLowerCase()).not.toContain("matching role");
    expect(result.reasoning.toLowerCase()).not.toContain("matches your search intent");
    expect(result.emailDraft).toBe("");
  });

  it("surfaces title signals for job-search mode", () => {
    const result = buildLeadWhyReasoning(
      {
        name: "Alex Abdelkawy",
        title: "Java | Full-stack | H1B Transfer Eligible",
        company: "Morgan Stanley",
        industry: "Finance",
        employees: 5000,
        location: "New York, New York",
        hasEmail: false,
        leadScore: 8,
      },
      {
        ...scoreContext,
        openToWork: true,
        searchIntent: "Software engineers in New York open to work",
        originalPrompt: "Find software engineers who are open to work",
      }
    );

    expect(result.reasoning).toContain("Morgan Stanley");
    expect(result.reasoning.toLowerCase()).toMatch(/visa|job-search|hire/);
    expect(result.reasoning.toLowerCase()).not.toContain("matching role");
    expect(result.emailDraft).toBe("");
  });
});
