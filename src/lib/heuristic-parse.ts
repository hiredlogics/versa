import { normalizeSearchCriteria } from "@/lib/search-criteria";
import { resolveEnvKey } from "@/lib/env";
import type { SearchCriteria } from "@/lib/types";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

const TITLE_HINTS: { pattern: RegExp; titles: string[] }[] = [
  { pattern: /\bfounders?\b/i, titles: ["Founder", "CEO", "Co-Founder"] },
  { pattern: /\bceo\b/i, titles: ["CEO", "Founder"] },
  { pattern: /\bcto\b/i, titles: ["CTO", "VP Engineering"] },
  { pattern: /\bcfo\b/i, titles: ["CFO", "Finance Director"] },
  { pattern: /\bvp\b/i, titles: ["VP", "Vice President"] },
  { pattern: /\bdirector\b/i, titles: ["Director", "Head of"] },
  { pattern: /\bhead of\b/i, titles: ["Head of", "Director"] },
  { pattern: /\bmarketing\b/i, titles: ["Marketing Director", "CMO", "Head of Marketing"] },
  { pattern: /\bsales\b/i, titles: ["Sales Director", "VP Sales", "Head of Sales"] },
  { pattern: /\bengineer/i, titles: ["Software Engineer", "Engineering Manager"] },
  {
    pattern: /\b(hr|human resources|people ops|people operations|talent|recruiter|chro)\b/i,
    titles: [
      "HR Manager",
      "Human Resources Manager",
      "Head of People",
      "People Operations Manager",
      "Talent Acquisition Manager",
    ],
  },
];

const LOCATION_HINTS: { pattern: RegExp; location: string }[] = [
  { pattern: /\b(united states|usa|\bus\b)\b/i, location: "United States" },
  { pattern: /\bcanada\b/i, location: "Canada" },
  { pattern: /\b(united kingdom|\buk\b)\b/i, location: "United Kingdom" },
  { pattern: /\baustralia\b/i, location: "Australia" },
  { pattern: /\bpakistan\b/i, location: "Pakistan" },
  { pattern: /\bcalifornia\b/i, location: "California" },
  { pattern: /\btexas\b/i, location: "Texas" },
  { pattern: /\b(new york|nyc|ny)\b/i, location: "New York" },
];

const INDUSTRY_HINTS: { pattern: RegExp; term: string }[] = [
  { pattern: /\breal\s*estate\b/i, term: "real estate" },
  { pattern: /\bproperty\s*management\b/i, term: "property management" },
  { pattern: /\bsaas\b/i, term: "SaaS" },
  { pattern: /\bai\b/i, term: "AI" },
  { pattern: /\bhealthcare\b/i, term: "healthcare" },
  { pattern: /\bfintech\b/i, term: "fintech" },
  { pattern: /\be-?commerce\b/i, term: "e-commerce" },
  { pattern: /\bretail\b/i, term: "retail" },
  { pattern: /\bbeauty\b/i, term: "beauty" },
  { pattern: /\bperfume\b/i, term: "beauty" },
  { pattern: /\bsoftware\b/i, term: "software" },
  { pattern: /\bstartup/i, term: "startup" },
  { pattern: /\b(hr|human resources)\b/i, term: "human resources" },
];

function extractTitles(prompt: string, leadContext?: UserLeadContextDTO | null): string[] {
  const titles = new Set<string>();

  for (const hint of TITLE_HINTS) {
    if (hint.pattern.test(prompt)) {
      hint.titles.forEach((title) => titles.add(title));
    }
  }

  for (const title of leadContext?.targetTitles ?? []) {
    if (title.trim()) titles.add(title.trim());
  }

  if (titles.size === 0) {
    return ["Director", "VP", "Head of"];
  }

  return [...titles].slice(0, 5);
}

function extractLocation(prompt: string, leadContext?: UserLeadContextDTO | null): string {
  for (const hint of LOCATION_HINTS) {
    if (hint.pattern.test(prompt)) return hint.location;
  }

  const fromContext = leadContext?.targetCountries?.find(Boolean);
  return fromContext ?? "United States";
}

function extractKeywords(prompt: string, leadContext?: UserLeadContextDTO | null): string | undefined {
  const terms = new Set<string>();

  for (const hint of INDUSTRY_HINTS) {
    if (hint.pattern.test(prompt)) terms.add(hint.term);
  }

  for (const industry of leadContext?.targetIndustries ?? []) {
    if (industry.trim()) terms.add(industry.trim());
  }

  const parts = prompt
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (TITLE_HINTS.some((hint) => hint.pattern.test(part))) continue;
    if (LOCATION_HINTS.some((hint) => hint.pattern.test(part))) continue;
    if (/\bcompanies?\b/i.test(part)) continue;
    if (part.length >= 3 && part.length <= 40) {
      terms.add(part.replace(/\b(startups?|companies?)\b/gi, "").trim());
    }
  }

  const cleaned = [...terms].map((term) => term.trim()).filter(Boolean).slice(0, 2);
  return cleaned.length > 0 ? cleaned.join(" ") : undefined;
}

function extractCompanySize(
  prompt: string,
  leadContext?: UserLeadContextDTO | null
): { min: number; max: number } {
  const match = prompt.match(/(\d+)\s*[-–]\s*(\d+)\s*employees?/i);
  if (match) {
    return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  }

  return {
    min: leadContext?.companySizeMin ?? 10,
    max: leadContext?.companySizeMax ?? 500,
  };
}

export function hasAiProvidersConfigured(): boolean {
  return Boolean(
    resolveEnvKey("OPENAI_API_KEY") ||
      resolveEnvKey("GROQ_API_KEY") ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim()
  );
}

export function heuristicParsePrompt(
  userPrompt: string,
  leadContext?: UserLeadContextDTO | null
): SearchCriteria {
  const lower = userPrompt.toLowerCase();
  const openToWork =
    /open\s+to\s+wor+k|open\s+to\s+wrok|job\s*seek|between\s+jobs|looking\s+for\s+(a\s+)?(job|work)|looking\s+.+open\s+to\s+wor/i.test(
      lower
    );
  const { min, max } = extractCompanySize(userPrompt, leadContext);
  const location = extractLocation(userPrompt, leadContext);
  const keywords = extractKeywords(userPrompt, leadContext);

  const personTitles = extractTitles(userPrompt, leadContext);
  const hrPrompt = /\b(hr|human resources|people ops|people operations)\b/i.test(userPrompt);
  const parsed = {
    summary: userPrompt.slice(0, 120),
    searchIntent: userPrompt,
    industry:
      leadContext?.targetIndustries?.[0] ||
      (hrPrompt ? "Human Resources" : undefined) ||
      keywords ||
      "Any",
    country: location,
    companySizeMin: min,
    companySizeMax: max,
    jobTitles: personTitles,
    openToWork,
    requireEmail: false,
    excludedTitles: leadContext?.excludedTitles ?? [],
    excludedIndustries: leadContext?.excludedIndustries ?? [],
    assumptionsUsedFromContext: leadContext ? ["Saved VARSA context applied (heuristic parser)"] : [],
    explicitOverridesFromPrompt: [],
    apollo: {
      personTitles,
      personLocations: [location],
      // Keep keywords even for OTW — Apollo has no open-to-work filter
      qKeywords: hrPrompt ? "human resources" : keywords,
    },
  };

  const criteria = normalizeSearchCriteria(parsed, userPrompt);
  criteria.excludedTitles = [...new Set(parsed.excludedTitles.map((t) => t.trim()).filter(Boolean))];
  criteria.excludedIndustries = [
    ...new Set(parsed.excludedIndustries.map((t) => t.trim()).filter(Boolean)),
  ];
  criteria.assumptionsUsedFromContext = parsed.assumptionsUsedFromContext;
  criteria.explicitOverridesFromPrompt = parsed.explicitOverridesFromPrompt;

  return criteria;
}
