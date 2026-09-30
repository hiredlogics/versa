import type { ApolloProfileRaw } from "./lead-profile";
import type { ApolloPerson, SearchCriteria } from "./types";
import { resolveEnvKey } from "./env";
import { APOLLO_HARD_MAX_PAGES, getApolloSearchConfig } from "./apollo-config";
import {
  formatApolloFiltersLog,
  buildApolloSearchVariants,
  type ApolloQueryVariant,
} from "./search-criteria";
import type { ApolloSearchFilters } from "./types";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";

export type SearchPeopleOptions = {
  maxPages?: number;
  /** Continue from this page (inclusive). When > 1, uses resumeFilters and skips smart-relax. */
  startPage?: number;
  resumeFilters?: ApolloSearchFilters;
  onProgress?: (
    page: number,
    totalPages: number,
    collected: number,
    totalAvailable: number
  ) => void | Promise<void>;
  shouldStop?: () => boolean | Promise<boolean>;
};

export type EnrichBatchOptions = {
  onProgress?: (current: number, total: number) => void;
  /** Stop unlocking when Date.now() >= deadlineAt; returns partial results. */
  deadlineAt?: number;
  shouldStop?: () => boolean | Promise<boolean>;
};

export function isApolloCreditsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /insufficient.?credit|not enough credit|credits?.?(exhausted|remaining|balance)|payment.?required|\(402\)|422.*credit/i.test(
    msg
  );
}

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

function getApolloApiKey(): string {
  const apiKey = resolveEnvKey("APOLLO_API_KEY");
  if (!apiKey) {
    console.error(
      JSON.stringify({
        scope: "lead-fetch",
        event: "apollo_api_key_missing",
        at: new Date().toISOString(),
      })
    );
    throw new Error(
      "Apollo provider is not configured on the server. Set APOLLO_API_KEY in the server environment."
    );
  }
  return apiKey;
}

function buildQueryUrl(
  endpoint: string,
  params: Record<string, string | number | boolean | string[] | undefined>
): string {
  const url = new URL(`${APOLLO_BASE_URL}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;

    if (Array.isArray(value)) {
      const paramKey = key.endsWith("[]") ? key : `${key}[]`;
      for (const item of value) {
        url.searchParams.append(paramKey, item);
      }
    } else if (typeof value === "boolean") {
      url.searchParams.append(key, value ? "true" : "false");
    } else {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

async function apolloPost<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | string[] | undefined> = {},
  options?: { body?: unknown; retries?: number }
): Promise<T> {
  const apiKey = getApolloApiKey();
  const url = buildQueryUrl(endpoint, params);
  const retries = options?.retries ?? 3;
  const hasBody = options?.body !== undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: hasBody ? JSON.stringify(options?.body) : undefined,
    });

    if (response.status === 429) {
      await sleep(Math.pow(2, attempt + 1) * 1000);
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apollo API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  throw new Error("Apollo API rate limit exceeded. Please try again later.");
}

interface ApolloSearchResponse {
  people: ApolloSearchRawPerson[];
  total_entries: number;
  pagination?: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

interface ApolloSearchRawPerson extends ApolloProfileRaw {
  id: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  email?: string | null;
  personal_emails?: string[] | null;
  contact?: {
    email?: string | null;
    emails?: Array<{ email?: string | null }> | null;
  } | null;
  contact_emails?: Array<{ email?: string | null }> | null;
  linkedin_url?: string;
  has_email?: boolean;
  email_status?: string | null;
  city?: string;
  state?: string;
  country?: string;
  organization?: {
    name?: string;
    industry?: string;
    estimated_num_employees?: number;
    city?: string;
    state?: string;
    country?: string;
  };
}

export interface EnrichedApolloResult {
  person: ApolloPerson;
  raw: ApolloSearchRawPerson | null;
}

/** Thrown when Apollo rejects unlock due to insufficient credits — do not retry singles. */
export class ApolloCreditsExhaustedError extends Error {
  readonly partial: EnrichedApolloResult[];

  constructor(partial: EnrichedApolloResult[], detail?: string) {
    super(detail || "Data provider credits exhausted — email unlock stopped.");
    this.name = "ApolloCreditsExhaustedError";
    this.partial = partial;
  }
}

interface ApolloBulkEnrichResponse {
  matches?: Array<ApolloSearchRawPerson | null>;
  people?: Array<ApolloSearchRawPerson | null>;
}

/** Manual maintenance helper. Search workflows use bulk_match only. */
export async function enrichPerson(personId: string): Promise<EnrichedApolloResult | null> {
  const data = await apolloPost<ApolloEnrichResponse>(
    "/people/match",
    { reveal_personal_emails: shouldRevealPersonalEmails() },
    { body: { id: personId } }
  );
  return data.person ? { person: normalizePerson(data.person), raw: data.person } : null;
}

/** Manual maintenance helper. Search workflows use bulk_match only. */
export async function enrichPersonByLinkedIn(linkedinUrl: string): Promise<EnrichedApolloResult | null> {
  const data = await apolloPost<ApolloEnrichResponse>(
    "/people/match",
    { reveal_personal_emails: shouldRevealPersonalEmails() },
    { body: { linkedin_url: linkedinUrl } }
  );
  return data.person ? { person: normalizePerson(data.person), raw: data.person } : null;
}

interface ApolloEnrichResponse {
  person?: ApolloSearchRawPerson;
}

/** Apollo locked / placeholder emails are not usable. */
export function isUsableEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const value = email.trim().toLowerCase();
  if (!value.includes("@")) return false;
  if (value === "julia.r@example.org") return false;
  if (value.includes("email_not_unlocked")) return false;
  if (value === "unavailable" || value === "n/a") return false;
  return true;
}

/** Pick the best unlocked email from an Apollo person payload. */
export function extractBestEmail(raw: ApolloSearchRawPerson | null | undefined): string | null {
  if (!raw) return null;

  const candidates: Array<string | null | undefined> = [
    raw.email,
    ...(Array.isArray(raw.personal_emails) ? raw.personal_emails : []),
    raw.contact?.email,
    ...(Array.isArray(raw.contact?.emails) ? raw.contact.emails.map((e) => e?.email) : []),
    ...(Array.isArray(raw.contact_emails) ? raw.contact_emails.map((e) => e?.email) : []),
  ];

  for (const candidate of candidates) {
    if (isUsableEmail(candidate)) return candidate!.trim();
  }
  return null;
}

function shouldRevealPersonalEmails(): boolean {
  return process.env.APOLLO_REVEAL_PERSONAL_EMAILS !== "false";
}

function normalizePerson(raw: ApolloSearchRawPerson, fallbackIndustry?: string): ApolloPerson {
  const org = raw.organization;
  const lastName = raw.last_name || raw.last_name_obfuscated || "";
  const email = extractBestEmail(raw);

  return {
    id: raw.id,
    first_name: raw.first_name || "",
    last_name: lastName,
    title: raw.title || "N/A",
    headline: raw.headline?.trim() || null,
    email,
    email_status: raw.email_status ?? null,
    linkedin_url: raw.linkedin_url || null,
    has_email: Boolean(email || raw.has_email),
    // Person address and employer address stay separate: mixing them field by
    // field produced impossible places like "Lahore, Scotland, United Kingdom".
    city: raw.city || "",
    state: raw.state || "",
    country: raw.country || "",
    organization: {
      name: org?.name || "Unknown",
      industry: org?.industry || fallbackIndustry || "N/A",
      estimated_num_employees: org?.estimated_num_employees || 0,
      city: org?.city || "",
      state: org?.state || "",
      country: org?.country || "",
    },
  };
}

function buildParamsFromFilters(
  filters: ApolloSearchFilters,
  page: number,
  perPage: number
): Record<string, string | number | string[] | undefined> {
  const params: Record<string, string | number | string[] | undefined> = {
    page,
    per_page: perPage,
    person_locations: Array.isArray(filters.personLocations)
      ? filters.personLocations
      : typeof filters.personLocations === "string"
        ? [filters.personLocations]
        : ["United States"],
    person_titles: (Array.isArray(filters.personTitles)
      ? filters.personTitles
      : typeof filters.personTitles === "string"
        ? [filters.personTitles]
        : ["Director"]
    ).slice(0, 5),
    include_similar_titles: filters.includeSimilarTitles === false ? "false" : "true",
  };

  if (filters.employeeRanges?.length) {
    params.organization_num_employees_ranges = filters.employeeRanges;
  }
  if (filters.qKeywords) {
    params.q_keywords = filters.qKeywords;
  }
  if (filters.organizationDomains?.length) {
    params.q_organization_domains_list = filters.organizationDomains;
  }

  return params;
}

export async function searchPeopleWithFilters(
  filters: ApolloSearchFilters,
  criteria: SearchCriteria,
  page = 1,
  perPage = 25
): Promise<{ people: ApolloPerson[]; totalPages: number; totalEntries: number }> {
  const params = buildParamsFromFilters(filters, page, perPage);

  const data = await apolloPost<ApolloSearchResponse>("/mixed_people/api_search", params);

  const totalEntries = data.total_entries ?? data.pagination?.total_entries ?? 0;
  const totalPages =
    data.pagination?.total_pages ?? Math.max(1, Math.ceil(totalEntries / perPage));

  const people = (data.people || []).map((p) =>
    normalizePerson(p, criteria.industry !== "Any" ? criteria.industry : undefined)
  );

  people.sort((a, b) => Number(b.has_email) - Number(a.has_email));

  return { people, totalPages, totalEntries };
}

export interface ApolloSearchResult {
  people: ApolloPerson[];
  totalPages: number;
  totalEntries: number;
  variant: ApolloQueryVariant;
}

async function searchWithSmartFallback(
  criteria: SearchCriteria,
  page: number,
  perPage: number
): Promise<ApolloSearchResult> {
  // Always allowed to widen a too-narrow query; the employer stays pinned.
  const smartRelax = true;
  const variants = buildApolloSearchVariants(criteria);
  // OTW keyword hits are rare; accepting a pool of 1 often means unlock finds
  // no verified email. Prefer a larger pool before stopping (still OTW-biased).
  const minAcceptPool = criteria.openToWork ? 25 : 1;

  logLeadFetch("apollo_filters_input", {
    filters: JSON.parse(formatApolloFiltersLog(criteria)) as Record<string, unknown>,
    variantCount: variants.length,
    smartRelax,
    minAcceptPool,
  });
  console.log(`[apollo] AI-generated filters:\n${formatApolloFiltersLog(criteria)}`);

  if (variants.length === 0) {
    throw new Error("No Apollo search filters generated from prompt");
  }

  let best: ApolloSearchResult | null = null;

  for (const variant of variants) {
    const result = await searchPeopleWithFilters(variant.filters, criteria, page, perPage);

    logLeadFetch("apollo_variant_attempt", {
      level: variant.level,
      label: variant.label,
      totalEntries: result.totalEntries,
      pagePeople: result.people.length,
      params: {
        person_titles: variant.filters.personTitles,
        person_locations: variant.filters.personLocations,
        q_keywords: variant.filters.qKeywords || null,
        organization_num_employees_ranges: variant.filters.employeeRanges || null,
        include_similar_titles: variant.filters.includeSimilarTitles !== false,
        page,
        per_page: perPage,
      },
    });

    if (result.totalEntries > 0 || result.people.length > 0) {
      const candidate: ApolloSearchResult = { ...result, variant };
      if (!best || candidate.totalEntries > best.totalEntries) {
        best = candidate;
      }

      // Accept once the pool is large enough — or immediately for non-OTW.
      if (!criteria.openToWork || result.totalEntries >= minAcceptPool) {
        if (variant.level > 0) {
          console.log(
            `[apollo] Smart relax level ${variant.level}: ${variant.label} → ${result.totalEntries} results`
          );
        }
        logLeadFetch("apollo_variant_selected", {
          level: variant.level,
          label: variant.label,
          totalEntries: result.totalEntries,
          relaxed: variant.level > 0,
        });
        return candidate;
      }

      console.log(
        `[apollo] Level ${variant.level} only ${result.totalEntries} hits (<${minAcceptPool}) — trying wider OTW variant`
      );
    }

    if (!smartRelax) break;
  }

  if (best) {
    console.log(
      `[apollo] Using best available pool: level ${best.variant.level} "${best.variant.label}" → ${best.totalEntries}`
    );
    logLeadFetch("apollo_variant_selected", {
      level: best.variant.level,
      label: best.variant.label,
      totalEntries: best.totalEntries,
      relaxed: best.variant.level > 0,
      bestEffort: true,
    });
    return best;
  }

  logLeadFetch("apollo_all_variants_empty", { variantCount: variants.length });
  console.log("[apollo] All filter levels returned 0 results");
  return {
    people: [],
    totalPages: 0,
    totalEntries: 0,
    variant: variants[variants.length - 1],
  };
}


/**
 * Unlock emails for people we already know, identified by Apollo id and/or
 * LinkedIn URL (10 per bulk_match request). Results line up with `details`;
 * null means Apollo found no match. Stops at the first credit-exhaustion
 * error instead of throwing, so the caller keeps everything unlocked so far.
 */
export async function revealEmailsForPeople(
  details: Array<{ id?: string | null; linkedinUrl?: string | null }>,
  options: { revealPersonalEmails?: boolean } = {}
): Promise<{ results: Array<EnrichedApolloResult | null>; attempted: number; creditsExhausted: boolean }> {
  const results: Array<EnrichedApolloResult | null> = [];
  const bulkSize = 10;
  for (let i = 0; i < details.length; i += bulkSize) {
    const chunk = details.slice(i, i + bulkSize);
    try {
      const data = await apolloPost<ApolloBulkEnrichResponse>(
        "/people/bulk_match",
        { reveal_personal_emails: options.revealPersonalEmails ?? false },
        {
          body: {
            details: chunk.map((person) => ({
              ...(person.id ? { id: person.id } : {}),
              ...(person.linkedinUrl ? { linkedin_url: person.linkedinUrl } : {}),
            })),
          },
        }
      );
      const matches = data.matches ?? data.people ?? [];
      for (let j = 0; j < chunk.length; j++) {
        const raw = matches[j];
        results.push(raw?.id ? { person: normalizePerson(raw), raw } : null);
      }
    } catch (error) {
      if (isApolloCreditsError(error)) {
        return { results, attempted: results.length, creditsExhausted: true };
      }
      throw error;
    }
    if (i + bulkSize < details.length) await sleep(120);
  }
  return { results, attempted: results.length, creditsExhausted: false };
}

/**
 * Unlock emails via Apollo bulk match (up to 10/request) with reveal_personal_emails.
 * Falls back to single match when bulk fails — except Apollo credit exhaustion (stops immediately).
 *
 * Callers: enrichWhyBatch.ts (enrichAndWhyInMemory, prepareLeadPage), lead-search.ts (legacy).
 * Optional 2nd arg may be a progress callback (legacy) or EnrichBatchOptions.
 */
export async function enrichPeopleBatch(
  people: ApolloPerson[],
  onProgressOrOptions?: ((current: number, total: number) => void) | EnrichBatchOptions
): Promise<EnrichedApolloResult[]> {
  if (people.length === 0) return [];

  const options: EnrichBatchOptions =
    typeof onProgressOrOptions === "function"
      ? { onProgress: onProgressOrOptions }
      : onProgressOrOptions ?? {};
  const { onProgress, deadlineAt, shouldStop } = options;

  const enriched: EnrichedApolloResult[] = [];
  const reveal = shouldRevealPersonalEmails();
  const bulkSize = 10;
  let done = 0;
  const chunkMs: number[] = [];
  let chunkFailures = 0;
  let stoppedEarly = false;

  for (let i = 0; i < people.length; i += bulkSize) {
    if (deadlineAt && Date.now() >= deadlineAt) {
      console.warn(
        `[apollo] unlock deadline reached after ${done}/${people.length} — returning partial`
      );
      stoppedEarly = true;
      break;
    }
    if (await shouldStop?.()) {
      stoppedEarly = true;
      break;
    }

    const chunk = people.slice(i, i + bulkSize);
    const chunkStarted = Date.now();
    let chunkOk = true;
    try {
      const data = await apolloPost<ApolloBulkEnrichResponse>(
        "/people/bulk_match",
        { reveal_personal_emails: reveal },
        {
          body: {
            details: chunk.map((person) => ({
              id: person.id,
              ...(person.linkedin_url ? { linkedin_url: person.linkedin_url } : {}),
            })),
          },
        }
      );

      const matches = data.matches ?? data.people ?? [];
      for (let j = 0; j < chunk.length; j++) {
        const raw = matches[j] ?? null;
        if (raw?.id) enriched.push({ person: normalizePerson(raw), raw });
      }
    } catch (error) {
      chunkOk = false;
      chunkFailures += 1;
      console.warn(
        `[apollo] bulk_match failed chunk=${i}:`,
        error instanceof Error ? error.message : error
      );

      if (isApolloCreditsError(error)) {
        // Do not amplify with 10× single enrich calls — credits are gone.
        for (const person of chunk) {
          enriched.push({ person, raw: null });
        }
        logLeadFetch("stage_chunk", {
          stage: "unlock",
          offset: i,
          size: chunk.length,
          durationMs: Date.now() - chunkStarted,
          ok: false,
          creditsExhausted: true,
        });
        throw new ApolloCreditsExhaustedError(enriched, error instanceof Error ? error.message : undefined);
      }

      // Never replace a failed bulk request with per-person provider calls.
    }

    const durationMs = Date.now() - chunkStarted;
    chunkMs.push(durationMs);
    logLeadFetch("stage_chunk", {
      stage: "unlock",
      offset: i,
      size: chunk.length,
      durationMs,
      ok: chunkOk,
    });

    done += chunk.length;
    onProgress?.(done, people.length);
    if (i + bulkSize < people.length) await sleep(120);
  }

  // Pad unprocessed people so callers can zip by id without gaps
  if (stoppedEarly && enriched.length < people.length) {
    const have = new Set(enriched.map((r) => r.person.id));
    for (const person of people) {
      if (!have.has(person.id)) enriched.push({ person, raw: null });
    }
  }

  const unlocked = enriched.filter((r) => isUsableEmail(r.person.email)).length;
  const sorted = [...chunkMs].sort((a, b) => a - b);
  const medianMs =
    sorted.length === 0
      ? null
      : sorted[Math.max(0, Math.ceil(0.5 * sorted.length) - 1)];
  const p95Ms =
    sorted.length === 0
      ? null
      : sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];

  logLeadFetch("stage_chunk_summary", {
    stage: "unlock",
    people: people.length,
    unlockedEmail: unlocked,
    chunkFailures,
    chunkCount: chunkMs.length,
    medianMs,
    p95Ms,
    maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    revealPersonal: reveal,
    stoppedEarly,
  });

  console.log(
    `[apollo] enrich batch done=${enriched.length} unlockedEmail=${unlocked} revealPersonal=${reveal} medianChunkMs=${medianMs} p95ChunkMs=${p95Ms} failures=${chunkFailures} stoppedEarly=${stoppedEarly}`
  );

  return enriched;
}

/**
 * Fetch the next ~targetCount unique people from Apollo (sequential pages).
 * Does not unlock emails — used by the 1,000-lead process batch loop.
 *
 * Callers: findLeadsWorkflow.ts (sequential batch jobs). searchAllPeople remains for legacy.
 */
export async function fetchPeopleBatch(options: {
  criteria: SearchCriteria;
  /** When set with startPage > 1, skips smart-relax and continues these filters. */
  resumeFilters?: ApolloSearchFilters;
  startPage: number;
  targetCount: number;
  seenIds?: Set<string>;
  onProgress?: (
    page: number,
    totalPages: number,
    collected: number,
    totalAvailable: number
  ) => void | Promise<void>;
  shouldStop?: () => boolean | Promise<boolean>;
}): Promise<{
  people: ApolloPerson[];
  activeFilters: ApolloSearchFilters;
  lastPage: number;
  totalPages: number;
  totalAvailable: number;
  apolloRelaxNote?: string;
  exhausted: boolean;
  stopped: boolean;
}> {
  const config = getApolloSearchConfig();
  const perPage = config.perPage;
  const pagesCap = config.maxPages;
  const startPage = Math.max(1, options.startPage);
  const targetCount = Math.max(1, options.targetCount);
  const seen = options.seenIds ?? new Set<string>();
  const batch: ApolloPerson[] = [];
  const pageDelayMs = Math.min(
    250,
    Math.max(50, parseInt(process.env.APOLLO_PAGE_DELAY_MS || "120", 10))
  );

  let activeFilters: ApolloSearchFilters;
  let totalAvailable: number;
  let totalPages: number;
  let apolloRelaxNote: string | undefined;
  let lastPage = startPage - 1;
  let stopped = false;

  if (startPage > 1 && options.resumeFilters) {
    activeFilters = options.resumeFilters;
    const probe = await searchPeopleWithFilters(activeFilters, options.criteria, 1, perPage);
    totalAvailable = probe.totalEntries;
    totalPages = Math.min(probe.totalPages || 1, pagesCap, APOLLO_HARD_MAX_PAGES);
  } else if (options.resumeFilters && startPage === 1) {
    // First batch after filters already chosen (e.g. same job continuing) — rare
    activeFilters = options.resumeFilters;
    const page1 = await searchPeopleWithFilters(activeFilters, options.criteria, 1, perPage);
    totalAvailable = page1.totalEntries;
    totalPages = Math.min(page1.totalPages || 1, pagesCap, APOLLO_HARD_MAX_PAGES);
    for (const person of page1.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        batch.push(person);
      }
    }
    lastPage = 1;
    await options.onProgress?.(1, totalPages, batch.length, totalAvailable);
  } else {
    const firstPage = await searchWithSmartFallback(options.criteria, 1, perPage);
    activeFilters = firstPage.variant.filters;
    totalAvailable = firstPage.totalEntries;
    totalPages = Math.min(firstPage.totalPages || 1, pagesCap, APOLLO_HARD_MAX_PAGES);
    apolloRelaxNote =
      firstPage.variant.level > 0
        ? `(Filters: ${firstPage.variant.label} — interests like "AI chatbots" ranked after fetch)`
        : undefined;

    for (const person of firstPage.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        batch.push(person);
      }
    }
    lastPage = 1;
    await options.onProgress?.(1, totalPages, batch.length, totalAvailable);
  }

  if (await options.shouldStop?.()) {
    return {
      people: batch,
      activeFilters,
      lastPage: Math.max(lastPage, 0),
      totalPages,
      totalAvailable,
      apolloRelaxNote,
      exhausted: lastPage >= totalPages,
      stopped: true,
    };
  }

  let page = lastPage + 1;
  // Fill by completing whole pages so resume never skips mid-page people.
  while (batch.length < targetCount && page <= totalPages) {
    if (await options.shouldStop?.()) {
      stopped = true;
      break;
    }
    if (page > 1 || lastPage >= 1) await sleep(pageDelayMs);
    const result = await searchPeopleWithFilters(activeFilters, options.criteria, page, perPage);
    if (!result.people.length) {
      lastPage = page;
      break;
    }
    for (const person of result.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        batch.push(person);
      }
    }
    lastPage = page;
    await options.onProgress?.(page, totalPages, batch.length, totalAvailable);
    page += 1;
    // Stop after this page if we have enough (do not leave mid-page remainder)
    if (batch.length >= targetCount) break;
  }

  const exhausted = lastPage >= totalPages || (batch.length === 0 && !stopped);
  logLeadFetch("apollo_batch_fetch", {
    startPage,
    lastPage,
    totalPages,
    collected: batch.length,
    targetCount,
    totalAvailable,
    exhausted,
    stopped,
  });

  return {
    // May be slightly over targetCount when the last page overshoots (e.g. 1000–1099)
    people: batch,
    activeFilters,
    lastPage: Math.max(lastPage, 0),
    totalPages,
    totalAvailable,
    apolloRelaxNote,
    exhausted,
    stopped,
  };
}

export async function searchAllPeople(
  criteria: SearchCriteria,
  maxPagesOrOptions?: number | SearchPeopleOptions,
  onProgressLegacy?: (
    page: number,
    totalPages: number,
    collected: number,
    totalAvailable: number
  ) => void | Promise<void>,
  shouldStopLegacy?: () => boolean | Promise<boolean>
): Promise<{
  people: ApolloPerson[];
  totalAvailable: number;
  apolloRelaxNote?: string;
  pagesFetched: number;
  totalPages: number;
  partial: boolean;
  stopped: boolean;
  activeFilters: ApolloSearchFilters;
}> {
  const options: SearchPeopleOptions =
    typeof maxPagesOrOptions === "object" && maxPagesOrOptions !== null
      ? maxPagesOrOptions
      : {
          maxPages: maxPagesOrOptions,
          onProgress: onProgressLegacy,
          shouldStop: shouldStopLegacy,
        };

  const config = getApolloSearchConfig();
  const perPage = config.perPage;
  const pagesCap = options.maxPages ?? config.maxPages;
  const startPage = Math.max(1, options.startPage ?? 1);
  const deadlineMs = Math.max(
    60_000,
    parseInt(process.env.SEARCH_DEADLINE_MS || "280000", 10)
  );
  const startedAt = Date.now();

  const allPeople: ApolloPerson[] = [];
  const seen = new Set<string>();
  const onProgress = options.onProgress;
  const shouldStop = options.shouldStop;

  let activeFilters: ApolloSearchFilters;
  let totalAvailable: number;
  let totalPages: number;
  let apolloRelaxNote: string | undefined;
  let lastPage = startPage - 1;

  if (startPage > 1 && options.resumeFilters) {
    activeFilters = options.resumeFilters;
    // Probe page 1 only for totals (cheap), then jump to startPage
    const probe = await searchPeopleWithFilters(activeFilters, criteria, 1, perPage);
    totalAvailable = probe.totalEntries;
    const apolloReportedPages = probe.totalPages || 1;
    totalPages = Math.min(apolloReportedPages, pagesCap, APOLLO_HARD_MAX_PAGES);
    console.log(
      `[apollo] RESUME from page ${startPage}/${totalPages} — pool ≈ ${totalAvailable}`
    );
  } else {
    const firstPage = await searchWithSmartFallback(criteria, 1, perPage);
    activeFilters = firstPage.variant.filters;
    const apolloReportedPages = firstPage.totalPages || 1;
    totalPages = Math.min(apolloReportedPages, pagesCap, APOLLO_HARD_MAX_PAGES);
    totalAvailable = firstPage.totalEntries;
    apolloRelaxNote =
      firstPage.variant.level > 0
        ? `(Filters: ${firstPage.variant.label} — interests like "AI chatbots" ranked after fetch)`
        : undefined;

    console.log(
      `[apollo] Total available: ${totalAvailable} — fetching ${totalPages} page(s) × ${perPage}` +
        ` = up to ${Math.min(totalAvailable, totalPages * perPage)} people`
    );

    for (const person of firstPage.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        allPeople.push(person);
      }
    }
    lastPage = 1;
    await onProgress?.(1, totalPages, allPeople.length, totalAvailable);

    if (await shouldStop?.()) {
      return {
        people: allPeople,
        totalAvailable,
        apolloRelaxNote,
        pagesFetched: 1,
        totalPages,
        partial: true,
        stopped: true,
        activeFilters,
      };
    }
  }

  const pageDelayMs = Math.min(
    800,
    Math.max(50, parseInt(process.env.APOLLO_PAGE_DELAY_MS || "120", 10))
  );

  let partial = false;
  let stopped = false;
  const loopStart = startPage > 1 ? startPage : 2;

  for (let page = loopStart; page <= totalPages; page++) {
    if (await shouldStop?.()) {
      console.warn(`[apollo] Stopped by user after page ${lastPage}/${totalPages} (${allPeople.length} people)`);
      stopped = true;
      partial = true;
      break;
    }

    if (Date.now() - startedAt > deadlineMs) {
      console.warn(
        `[apollo] Deadline reached after page ${lastPage}/${totalPages} — saved progress (${allPeople.length} people)`
      );
      partial = true;
      break;
    }

    if (page > loopStart || startPage > 1) await sleep(pageDelayMs);

    const result = await searchPeopleWithFilters(activeFilters, criteria, page, perPage);
    if (!result.people.length) {
      console.warn(`[apollo] Empty page ${page} — stopping pagination early (${allPeople.length} collected)`);
      break;
    }
    for (const person of result.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        allPeople.push(person);
      }
    }
    lastPage = page;
    await onProgress?.(page, totalPages, allPeople.length, totalAvailable);

    if (page % 25 === 0 || page === totalPages) {
      console.log(`[apollo] progress page ${page}/${totalPages} — ${allPeople.length} people so far`);
    }
  }

  if (lastPage < totalPages && !stopped) {
    partial = true;
  }

  logLeadFetch("apollo_pull_complete", {
    peoplePulled: allPeople.length,
    totalAvailable,
    pagesFetched: Math.max(lastPage, 0),
    totalPages,
    partial,
    stopped,
    relaxNote: apolloRelaxNote ?? null,
  });

  return {
    people: allPeople,
    totalAvailable,
    apolloRelaxNote,
    pagesFetched: Math.max(lastPage, 0),
    totalPages,
    partial,
    stopped,
    activeFilters,
  };
}

export function formatApolloPerson(person: ApolloPerson) {
  const org = person.organization;
  const personLocation = [person.city, person.state, person.country].filter(Boolean).join(", ");
  const orgLocation = [org?.city, org?.state, org?.country].filter(Boolean).join(", ");
  const email = isUsableEmail(person.email) ? person.email!.trim() : null;

  return {
    id: person.id,
    name: `${person.first_name || ""} ${person.last_name || ""}`.trim() || "Unknown",
    title: person.title || "N/A",
    company: org?.name || "Unknown",
    industry: org?.industry || "N/A",
    employees: org?.estimated_num_employees || 0,
    // Show where the person is; the employer HQ is only a fallback.
    location: personLocation || orgLocation || "N/A",
    email,
    emailStatus: person.email_status ?? null,
    linkedinUrl: person.linkedin_url,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
