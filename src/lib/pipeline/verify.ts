import type {
  Brief,
  Candidate,
  ProviderSearchFilters,
  RejectReason,
  VerifiedLead,
} from "./types";

/**
 * Filters and verification. No AI, no network, no database — given the same
 * brief this must produce the same query on batch 5 as on batch 1.
 */

export const FIT_THRESHOLD = 45;

const TITLE_EXACT = 40;
const TITLE_SUBSTRING = 32;
const TITLE_TOKEN = 18;
const LOCATION_CONFIRM = 15;
const INDUSTRY_MATCH = 20;
const SIGNAL_HIT = 8;
const SIGNAL_MAX = 15;
const EMAIL_LIKELY = 10;

export function toFilters(brief: Brief): ProviderSearchFilters {
  return {
    personTitles: [...brief.titles],
    personLocations: brief.location ? [brief.location] : [],
    // Industry only. Signals are ranking hints; sending them as keywords
    // matches company names and wrecks recall.
    qKeywords: brief.industry ?? undefined,
    employeeRanges: brief.employeeRanges.length > 0 ? [...brief.employeeRanges] : undefined,
    includeSimilarTitles: true,
  };
}

interface ProviderPerson {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  has_email?: boolean | null;
  linkedin_url?: string | null;
  headline?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  organization?: {
    name?: string | null;
    industry?: string | null;
    estimated_num_employees?: number | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
}

function join(...parts: Array<string | null | undefined>): string | null {
  const value = parts.map((p) => p?.trim()).filter(Boolean).join(", ");
  return value.length > 0 ? value : null;
}

export function toCandidate(person: ProviderPerson): Candidate {
  const org = person.organization ?? null;
  const name = [person.first_name, person.last_name]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");

  const email = person.email?.trim();

  return {
    providerId: person.id?.trim() || "",
    name: name.length > 0 ? name : "Unknown",
    title: person.title?.trim() || "",
    company: org?.name?.trim() || "Unknown",
    industry: org?.industry?.trim() || null,
    employees: typeof org?.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    // Person address first; the employer's is only a fallback.
    location: join(person.city, person.state, person.country) ?? join(org?.city, org?.state, org?.country),
    linkedinUrl: person.linkedin_url?.trim() || null,
    // An address present in search data implies one exists even when the
    // provider omits its has_email flag.
    emailLikely: Boolean(email) || person.has_email === true,
    headline: person.headline?.trim() || null,
  };
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 3);
}

export function scoreTitle(title: string, wanted: string[]): number {
  const candidate = title.trim().toLowerCase();
  if (!candidate || wanted.length === 0) return 0;

  let best = 0;
  for (const want of wanted) {
    const target = want.trim().toLowerCase();
    if (!target) continue;

    if (candidate === target) return TITLE_EXACT;
    if (candidate.includes(target) || target.includes(candidate)) {
      best = Math.max(best, TITLE_SUBSTRING);
      continue;
    }
    const shared = tokens(target).some((token) => tokens(candidate).includes(token));
    if (shared) best = Math.max(best, TITLE_TOKEN);
  }

  return best;
}

function withinRanges(employees: number, ranges: string[]): boolean {
  if (ranges.length === 0) return true;
  return ranges.some((range) => {
    const [min, max] = range.split(",").map((n) => parseInt(n, 10));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return true;
    return employees >= min && employees <= max;
  });
}

function matchesAny(value: string | null, list: string[]): boolean {
  if (!value) return false;
  const haystack = value.toLowerCase();
  return list.some((entry) => {
    const needle = entry.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

export type CheckResult =
  | { keep: true; fit: number }
  | { keep: false; reason: RejectReason };

export function check(candidate: Candidate, brief: Brief): CheckResult {
  // Hard rejects first. Scoring someone the user explicitly ruled out can
  // produce a passing fit.
  if (matchesAny(candidate.title, brief.excludeTitles)) {
    return { keep: false, reason: "excluded_title" };
  }
  if (matchesAny(candidate.industry, brief.excludeIndustries)) {
    return { keep: false, reason: "excluded_industry" };
  }

  const titleScore = scoreTitle(candidate.title, brief.titles);
  if (titleScore === 0) {
    return { keep: false, reason: "title_mismatch" };
  }

  // Unknown headcount passes. Unlike a credit check, the permissive default is
  // correct here: the provider omits this constantly, and rejecting on a blank
  // field discards people who match perfectly well.
  if (candidate.employees !== null && !withinRanges(candidate.employees, brief.employeeRanges)) {
    return { keep: false, reason: "size_mismatch" };
  }

  let fit = titleScore;

  // Missing location also passes — the provider already filtered by location
  // server-side, so its patchy per-person copy is a bonus, not a gate.
  if (brief.location && candidate.location) {
    if (candidate.location.toLowerCase().includes(brief.location.trim().toLowerCase())) {
      fit += LOCATION_CONFIRM;
    }
  }

  if (brief.industry && matchesAny(candidate.industry, [brief.industry])) {
    fit += INDUSTRY_MATCH;
  }

  if (brief.signals.length > 0) {
    const haystack = `${candidate.title} ${candidate.headline ?? ""}`.toLowerCase();
    const hits = brief.signals.filter((signal) => {
      const needle = signal.trim().toLowerCase();
      return needle.length > 0 && haystack.includes(needle);
    }).length;
    fit += Math.min(SIGNAL_MAX, hits * SIGNAL_HIT);
  }

  if (candidate.emailLikely) fit += EMAIL_LIKELY;

  fit = Math.min(100, fit);

  if (fit < FIT_THRESHOLD) {
    return { keep: false, reason: "low_fit" };
  }

  return { keep: true, fit };
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

export type FinalizeResult =
  | { keep: true; lead: VerifiedLead }
  | { keep: false; reason: RejectReason };

export function finalize(
  candidate: Candidate,
  fit: number,
  email: string | null | undefined,
  isUsable: (email: string) => boolean = looksLikeEmail,
  emailStatus: string | null = null
): FinalizeResult {
  // Trim BEFORE validating: providers pad this field, and discarding a padded
  // but valid address throws away a credit that has already been spent.
  const trimmed = (email ?? "").trim();
  if (!trimmed || !isUsable(trimmed)) {
    return { keep: false, reason: "no_email" };
  }

  return { keep: true, lead: { candidate, fit, email: trimmed, emailStatus } };
}
