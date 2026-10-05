import type { ParsedJobDescription } from "@/lib/validations/search-criteria";
import type { ParsedSearchCriteria } from "@/lib/validations/search-criteria";
import type { ClarificationQuestion } from "@/lib/clarifyPrompt";

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface LeadRecord {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string | null;
  employees: number | null;
  location: string | null;
  email: string | null;
  /** Provider email confidence: "verified" | "guessed" | null when unknown. */
  emailStatus?: string | null;
  linkedinUrl: string | null;
  leadScore: number;
  priorityLevel: PriorityLevel;
  reasoning: string | null;
  recommendedApproach: string | null;
  hasEmail: boolean;
  matchedSkills?: string[];
  missingSkills?: string[];
  /** Points for / against the score, shown when hovering it. */
  scorePros?: string[];
  scoreCons?: string[];
  openToWorkLevel?: string | null;
  openToWorkReasons?: string[];
}

export interface FindLeadsResponse {
  searchId: string;
  leads: LeadRecord[];
  criteria: ParsedSearchCriteria;
  totalAvailable?: number;
  /** Actual rows saved for this search (may be >> leads.length preview) */
  totalSaved?: number;
  /** Server offset for the current leads batch */
  leadsOffset?: number;
  apolloRelaxNote?: string;
  message: string;
  /** When true, client should poll GET /api/searches/:id until COMPLETE/FAILED */
  async?: boolean;
  status?: string;
  canResume?: boolean;
  questions?: ClarificationQuestion[];
  requestedLeadCount?: number;
  leadsRemaining?: number;
  batchSize?: number;
  jobRequirements?: ParsedJobDescription | null;
}

export interface AdvancedFilters {
  industry?: string;
  country?: string;
  companySizeMin?: number;
  companySizeMax?: number;
  jobTitles?: string;
  seniority?: string;
  maxLeads?: number;
  minScore?: number;
}

export type SearchStepStatus = "pending" | "running" | "complete" | "failed";

export interface SearchStep {
  id: string;
  label: string;
  description?: string;
  status: SearchStepStatus;
}

export function priorityLabel(level: PriorityLevel): string {
  const map: Record<PriorityLevel, string> = {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    VERY_HIGH: "Very High",
  };
  return map[level] ?? level;
}

/** "linkedin.com/in/jane" → "https://linkedin.com/in/jane"; empty stays empty. */
export function withHttps(url: string | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isLinkedInProfileUrl(url: string): boolean {
  return /^https?:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\/[^/?#\s]+/i.test(url);
}

export function buildPromptWithFilters(
  prompt: string,
  filters: AdvancedFilters,
  extras: { linkedinUrl?: string; companyUrl?: string; companyName?: string }
): string {
  const parts: string[] = [prompt.trim()];
  if (extras.linkedinUrl) parts.push(`LinkedIn profile: ${extras.linkedinUrl}`);
  if (extras.companyUrl) parts.push(`Company URL: ${extras.companyUrl}`);
  if (extras.companyName) parts.push(`Company name: ${extras.companyName}`);
  if (filters.industry) parts.push(`Industry: ${filters.industry}`);
  if (filters.country) parts.push(`Country: ${filters.country}`);
  if (filters.companySizeMin || filters.companySizeMax) {
    parts.push(
      `Company size: ${filters.companySizeMin ?? "any"}-${filters.companySizeMax ?? "any"} employees`
    );
  }
  if (filters.jobTitles) parts.push(`Job titles: ${filters.jobTitles}`);
  if (filters.seniority) parts.push(`Seniority: ${filters.seniority}`);
  return parts.filter(Boolean).join(". ");
}
