import type { Lead, LeadSearch, PriorityLevel } from "@prisma/client";
import type { ParsedSearchCriteria } from "@/lib/validations/search-criteria";
import type { LeadRecord } from "@/lib/types/lead-finder";
import type {
  SearchDisplayStatus,
  SearchHistoryItem,
  SearchLeadPreview,
} from "@/lib/types/search-history";

type LeadPreviewRow = Pick<
  Lead,
  "id" | "name" | "title" | "company" | "industry" | "leadScore" | "priorityLevel"
>;

export function parseCriteria(raw: unknown): ParsedSearchCriteria | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ParsedSearchCriteria;
}

export function buildCriteriaSummary(criteria: ParsedSearchCriteria | null): string[] {
  if (!criteria) return [];

  const parts: string[] = [];
  if (criteria.country) parts.push(criteria.country);
  if (criteria.companySizeMin != null || criteria.companySizeMax != null) {
    parts.push(
      `${criteria.companySizeMin ?? "any"}–${criteria.companySizeMax ?? "any"} employees`
    );
  }
  if (criteria.industry) parts.push(criteria.industry);
  if (criteria.keywords?.length) parts.push(...criteria.keywords.slice(0, 3));
  if (criteria.jobTitles?.length) parts.push(...criteria.jobTitles.slice(0, 3));
  if (criteria.seniorityLevels?.length) parts.push(...criteria.seniorityLevels.slice(0, 2));

  return [...new Set(parts.filter(Boolean))];
}

export function resolveDisplayStatus(
  status: string,
  leadsReturned: number,
  relaxNote: string | null
): SearchDisplayStatus {
  if (status === "FAILED") return "failed";
  if (status === "RUNNING" || status === "PENDING") return "running";
  if (status === "COMPLETE" && leadsReturned === 0) return "no_leads";
  if (status === "COMPLETE" && relaxNote) return "partial";
  return "complete";
}

function topUnique(values: (string | null | undefined)[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function averageScore(leads: LeadPreviewRow[]): number | null {
  if (leads.length === 0) return null;
  const sum = leads.reduce((acc, lead) => acc + lead.leadScore, 0);
  return Math.round((sum / leads.length) * 10) / 10;
}

function toLeadPreview(lead: LeadPreviewRow): SearchLeadPreview {
  return {
    id: lead.id,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    score: lead.leadScore,
    priorityLevel: lead.priorityLevel as PriorityLevel,
  };
}

export function mapLeadToRecord(lead: Lead): LeadRecord {
  return {
    id: lead.id,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry,
    employees: lead.employees,
    location: lead.location,
    email: lead.email,
    emailStatus: lead.emailStatus,
    linkedinUrl: lead.linkedinUrl,
    leadScore: lead.leadScore,
    priorityLevel: lead.priorityLevel as PriorityLevel,
    reasoning: lead.reasoning,
    recommendedApproach: lead.recommendedApproach,
    hasEmail: lead.hasEmail,
  };
}

export function mapSearchToHistoryItem(
  search: LeadSearch & { leads: LeadPreviewRow[] }
): SearchHistoryItem {
  const parsedCriteria = parseCriteria(search.parsedCriteria);
  const displayStatus = resolveDisplayStatus(
    search.status,
    search.leadsReturned,
    search.relaxNote
  );

  return {
    id: search.id,
    prompt: search.prompt,
    status: search.status,
    displayStatus,
    totalFound: search.totalAvailable ?? search.leadsReturned,
    totalQualified: search.leadsReturned,
    averageScore: averageScore(search.leads),
    parsedCriteria,
    criteriaSummary: buildCriteriaSummary(parsedCriteria),
    topTitles: topUnique(
      search.leads.map((l) => l.title),
      4
    ),
    topIndustries: topUnique(
      search.leads.map((l) => l.industry),
      3
    ),
    topLeads: search.leads.slice(0, 3).map(toLeadPreview),
    createdAt: search.createdAt.toISOString(),
    updatedAt: search.updatedAt.toISOString(),
    durationMs: search.durationMs,
    relaxNote: search.relaxNote,
    errorMessage: search.errorMessage,
  };
}

type SummaryCriteria = ParsedSearchCriteria & {
  openToWork?: boolean;
  searchIntent?: string;
  summary?: string;
};

export function buildAssistantSummary(
  criteria: SummaryCriteria | null,
  totalQualified: number,
  totalFound: number
): string {
  const openToWork = Boolean(criteria?.openToWork);
  const titles = criteria?.jobTitles?.slice(0, 3).filter(Boolean) ?? [];
  const location = criteria?.country?.trim();
  const industry =
    criteria?.industry && criteria.industry !== "Any" ? criteria.industry : null;

  let base: string;
  if (criteria?.intentSummary?.trim()) {
    base = criteria.intentSummary.trim().replace(/\.$/, "");
  } else if (openToWork) {
    const role = titles[0] || "professionals";
    const where = location ? ` in ${location}` : "";
    base = `I interpreted this as ${role}${where} open to work. Only people with job-seeking wording in title/headline are unlocked and saved`;
  } else {
    const parts: string[] = [];
    if (titles.length) parts.push(titles.join(", "));
    if (location) parts.push(`in ${location}`);
    if (criteria?.companySizeMin != null || criteria?.companySizeMax != null) {
      parts.push(
        `at companies with ${criteria.companySizeMin ?? "any"}–${criteria.companySizeMax ?? "any"} employees`
      );
    }
    if (industry) parts.push(`in ${industry}`);
    base =
      parts.length > 0
        ? `I interpreted this as ${parts.join(" ")}`
        : "I interpreted your prompt and ran a targeted lead search";
  }

  if (totalQualified > 0) {
    const pool =
      totalFound > totalQualified
        ? ` from ~${totalFound.toLocaleString()} matches for this prompt`
        : "";
    return `${base}. Saved ${totalQualified.toLocaleString()} lead${totalQualified !== 1 ? "s" : ""}${pool}.`;
  }

  if (totalFound > 0) {
    return `${base}. ~${totalFound.toLocaleString()} matches available — still pulling / saving for this prompt.`;
  }

  return `${base}. No qualified leads matched this search.`;
}
