import type { LeadScoreContext, LeadScoreResult } from "./types";

export type HeuristicLeadInput = {
  name: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  location: string;
  hasEmail?: boolean;
};

const OTW_TITLE_SIGNALS = [
  "open to work",
  "seeking",
  "available",
  "freelance",
  "consultant",
  "between roles",
  "open to opportunities",
  "career break",
  "looking for",
];

const ROLE_SIGNALS = [
  "engineer",
  "developer",
  "product manager",
  "designer",
  "software",
  "ml",
  "data",
  "architect",
  "analyst",
];

const AUTHORITY_SIGNALS = [
  "ceo",
  "cto",
  "founder",
  "co-founder",
  "chief",
  "vp",
  "vice president",
  "president",
  "owner",
  "head of",
];

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "who", "are", "interested", "looking", "find", "people",
  "that", "from", "have", "need", "want", "their", "about", "into", "this", "those",
]);

function intentSignals(context?: LeadScoreContext): string[] {
  const text = `${context?.searchIntent || ""} ${context?.keywords || ""}`.toLowerCase();
  const tokens = text
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(tokens)];
}

function textMatchesSignals(text: string, signals: string[]): boolean {
  if (signals.length === 0) return false;
  return signals.some((s) => text.includes(s));
}

const BUYER_SIGNALS = [
  "cto",
  "cio",
  "chief information",
  "chief technology",
  "chief innovation",
  "chief digital",
  "vp engineering",
  "vp operations",
  "vp product",
  "head of ai",
  "head of data",
  "director of it",
  "director of engineering",
  "director of innovation",
  "director of digital",
  "founder",
  "ceo",
  "president",
  "owner",
];

export function heuristicScoreLead(
  lead: HeuristicLeadInput,
  context?: LeadScoreContext
): LeadScoreResult {
  let score = 5;
  const reasons: string[] = [];
  const title = lead.title.toLowerCase();
  const industry = lead.industry.toLowerCase();
  const company = lead.company.toLowerCase();
  const combined = `${title} ${industry} ${company}`;
  const signals = intentSignals(context);

  if (context?.openToWork) {
    if (OTW_TITLE_SIGNALS.some((s) => title.includes(s))) {
      score += 3;
      reasons.push("Job-seeking signal in title");
    }
    if (ROLE_SIGNALS.some((s) => title.includes(s))) {
      score += 2;
      reasons.push("Matching role");
    }
    if (textMatchesSignals(title, signals) || textMatchesSignals(combined, signals)) {
      score += 2;
      reasons.push("Matches your search intent");
    }
    // Employed professionals in the target role are still valid outreach/hire targets
    if (score < 7 && ROLE_SIGNALS.some((s) => title.includes(s))) {
      score = 7;
      reasons.push("Target role match for this job search");
    }
    if (lead.hasEmail) {
      score += 1;
      reasons.push("Email available");
    }
    if (lead.employees >= 11 && lead.employees <= 5000) {
      score += 1;
      reasons.push("Known company size");
    }
  } else {
    if (AUTHORITY_SIGNALS.some((s) => title.includes(s))) {
      score += 2;
      reasons.push("Decision-making authority");
    }
    if (signals.length > 0 && BUYER_SIGNALS.some((s) => title.includes(s))) {
      score += 1;
      reasons.push("Decision-maker for this search");
    }
    if (textMatchesSignals(title, signals)) {
      score += 2;
      reasons.push("Intent match in title");
    }
    if (textMatchesSignals(`${industry} ${company}`, signals)) {
      score += 2;
      reasons.push("Intent match in company/industry");
    }
    if (lead.hasEmail) {
      score += 1;
      reasons.push("Email available");
    }
    if (lead.employees >= 10 && lead.employees <= 500) {
      score += 1;
      reasons.push("Ideal company size");
    }
  }

  score = Math.min(10, Math.max(1, score));

  // ICP-aware adjustments from saved context
  if (context?.leadContext) {
    const ctx = context.leadContext;
    const titleLower = title;
    const industryLower = industry;

    if (ctx.targetTitles.some((t) => titleLower.includes(t.toLowerCase()))) {
      score += 1;
      reasons.push("Matches saved target title");
    }
    if (ctx.targetIndustries.some((t) => industryLower.includes(t.toLowerCase()))) {
      score += 1;
      reasons.push("Matches saved target industry");
    }
    if (
      ctx.companySizeMin != null &&
      ctx.companySizeMax != null &&
      lead.employees >= ctx.companySizeMin &&
      lead.employees <= ctx.companySizeMax
    ) {
      score += 1;
      reasons.push("Matches saved company size range");
    }
    if (ctx.servicesToSell.length > 0) {
      const svcText = ctx.servicesToSell.join(" ").toLowerCase();
      if (textMatchesSignals(combined, svcText.split(/\s+/).filter((w) => w.length > 3))) {
        score += 1;
        reasons.push("Relevant to services you sell");
      }
    }
  }

  score = Math.min(10, Math.max(1, score));
  const priority: LeadScoreResult["priority"] =
    score >= 8 ? "High" : score >= 6 ? "Medium" : "Low";

  return {
    score,
    reasoning: reasons.length ? reasons.join(". ") : "Standard profile match",
    priority,
  };
}

export function heuristicScoreLeadsBatch(
  leads: HeuristicLeadInput[],
  context?: LeadScoreContext
): LeadScoreResult[] {
  return leads.map((lead) => heuristicScoreLead(lead, context));
}
