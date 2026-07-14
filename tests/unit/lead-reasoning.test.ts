import { describe, it, expect } from "vitest";
import { extractProfileSummary, toStoredApolloProfile } from "@/lib/lead-profile";
import { buildLeadWhyReasoning } from "@/lib/services/ai/leadReasoning";
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

describe("buildLeadWhyReasoning", () => {
  it("returns why-text plus a customized email draft with subject", () => {
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

    expect(result.reasoning).toContain("Jane Doe is CEO at CloudCo");
    expect(result.reasoning).toContain("San Francisco");
    expect(result.reasoning).toContain("AI lead scoring");
    expect(result.reasoning).toContain("Career: CEO at CloudCo");

    expect(result.emailDraft).toContain("Subject:");
    expect(result.emailDraft).toContain("Hi Jane");
    expect(result.emailDraft).toContain("CloudCo");
    expect(result.emailDraft).toContain("Reference their recent product launch");
    expect(result.emailDraft).toContain("Lead scoring automation");
  });

  it("notes missing email and still produces an email-style draft", () => {
    const result = buildLeadWhyReasoning(
      {
        name: "John Smith",
        title: "CTO",
        company: "TechCo",
        industry: "Software",
        employees: 80,
        location: "Toronto, Canada",
        hasEmail: false,
        leadScore: 7,
      },
      scoreContext
    );

    expect(result.reasoning).toContain("John Smith is CTO at TechCo");
    expect(result.reasoning).toContain("no email");
    expect(result.emailDraft).toContain("Hi John");
    expect(result.emailDraft).toContain("TechCo");
  });
});
