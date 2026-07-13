import type { ApolloProfileRaw } from "./lead-profile";
import type { ApolloPerson, SearchCriteria } from "./types";
import { resolveEnvKey } from "./env";
import { getApolloSearchConfig } from "./apollo-config";
import {
  formatApolloFiltersLog,
  buildApolloSearchVariants,
  type ApolloQueryVariant,
} from "./search-criteria";
import type { ApolloSearchFilters } from "./types";

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

function getApolloApiKey(): string {
  const apiKey = resolveEnvKey("APOLLO_API_KEY");
  if (!apiKey) {
    throw new Error("Apollo provider is not configured on the server.");
  }
  return apiKey;
}

function buildQueryUrl(endpoint: string, params: Record<string, string | number | string[] | undefined>): string {
  const url = new URL(`${APOLLO_BASE_URL}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;

    if (Array.isArray(value)) {
      const paramKey = key.endsWith("[]") ? key : `${key}[]`;
      for (const item of value) {
        url.searchParams.append(paramKey, item);
      }
    } else {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

async function apolloPost<T>(endpoint: string, params: Record<string, string | number | string[] | undefined>, retries = 3): Promise<T> {
  const apiKey = getApolloApiKey();
  const url = buildQueryUrl(endpoint, params);

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
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
  email?: string;
  linkedin_url?: string;
  has_email?: boolean;
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

interface ApolloEnrichResponse {
  person?: ApolloSearchRawPerson;
}

function normalizePerson(raw: ApolloSearchRawPerson, fallbackIndustry?: string): ApolloPerson {
  const org = raw.organization;
  const lastName = raw.last_name || raw.last_name_obfuscated || "";

  return {
    id: raw.id,
    first_name: raw.first_name || "",
    last_name: lastName,
    title: raw.title || "N/A",
    email: raw.email || null,
    linkedin_url: raw.linkedin_url || null,
    has_email: raw.has_email ?? Boolean(raw.email),
    organization: {
      name: org?.name || "Unknown",
      industry: org?.industry || fallbackIndustry || "N/A",
      estimated_num_employees: org?.estimated_num_employees || 0,
      city: org?.city || raw.city || "",
      state: org?.state || raw.state || "",
      country: org?.country || raw.country || "",
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
    person_locations: filters.personLocations,
    person_titles: filters.personTitles.slice(0, 5),
    include_similar_titles: filters.includeSimilarTitles === false ? "false" : "true",
  };

  if (filters.employeeRanges?.length) {
    params.organization_num_employees_ranges = filters.employeeRanges;
  }
  if (filters.qKeywords) {
    params.q_keywords = filters.qKeywords;
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
  const smartRelax = process.env.APOLLO_SMART_RELAX !== "false";
  const variants = buildApolloSearchVariants(criteria);

  console.log(`[apollo] AI-generated filters:\n${formatApolloFiltersLog(criteria)}`);

  if (variants.length === 0) {
    throw new Error("No Apollo search filters generated from prompt");
  }

  for (const variant of variants) {
    const result = await searchPeopleWithFilters(variant.filters, criteria, page, perPage);

    if (result.totalEntries > 0 || result.people.length > 0) {
      if (variant.level > 0) {
        console.log(
          `[apollo] Smart relax level ${variant.level}: ${variant.label} → ${result.totalEntries} results`
        );
        console.log(`[apollo] Active filters:\n${JSON.stringify({
          person_titles: variant.filters.personTitles,
          person_locations: variant.filters.personLocations,
          q_keywords: variant.filters.qKeywords || null,
          organization_num_employees_ranges: variant.filters.employeeRanges || null,
        }, null, 2)}`);
      }
      return { ...result, variant };
    }

    if (!smartRelax) break;
    console.log(`[apollo] Level ${variant.level} returned 0 — trying: ${variant.label}`);
  }

  console.log("[apollo] All filter levels returned 0 results");
  return {
    people: [],
    totalPages: 0,
    totalEntries: 0,
    variant: variants[variants.length - 1],
  };
}

export async function enrichPerson(personId: string): Promise<EnrichedApolloResult | null> {
  try {
    const data = await apolloPost<ApolloEnrichResponse>("/people/match", { id: personId });
    if (!data.person) return null;
    return { person: normalizePerson(data.person), raw: data.person };
  } catch {
    return null;
  }
}

export async function enrichPersonByLinkedIn(
  linkedinUrl: string
): Promise<EnrichedApolloResult | null> {
  try {
    const data = await apolloPost<ApolloEnrichResponse>("/people/match", {
      linkedin_url: linkedinUrl,
    });
    if (!data.person) return null;
    return { person: normalizePerson(data.person), raw: data.person };
  } catch {
    return null;
  }
}

export async function enrichPeopleBatch(
  people: ApolloPerson[],
  onProgress?: (current: number, total: number) => void
): Promise<EnrichedApolloResult[]> {
  const enriched: EnrichedApolloResult[] = [];

  for (let i = 0; i < people.length; i++) {
    onProgress?.(i + 1, people.length);
    const result = await enrichPerson(people[i].id);
    enriched.push(result ?? { person: people[i], raw: null });
    if (i < people.length - 1) await sleep(250);
  }

  return enriched;
}

export async function searchAllPeople(
  criteria: SearchCriteria,
  maxPages?: number,
  onProgress?: (page: number, total: number) => void
): Promise<{ people: ApolloPerson[]; totalAvailable: number; apolloRelaxNote?: string }> {
  const config = getApolloSearchConfig();
  const perPage = config.perPage;
  const pagesToFetch = maxPages ?? config.maxPages;

  const allPeople: ApolloPerson[] = [];
  const seen = new Set<string>();

  const firstPage = await searchWithSmartFallback(criteria, 1, perPage);
  const activeFilters = firstPage.variant.filters;
  const totalPages = Math.min(firstPage.totalPages || 1, pagesToFetch);
  const totalAvailable = firstPage.totalEntries;

  const relaxNote =
    firstPage.variant.level > 0
      ? `(Apollo: ${firstPage.variant.label} — interests like "AI chatbots" ranked after fetch)`
      : undefined;

  console.log(
    `[apollo] Total available: ${totalAvailable} — fetching ${totalPages} page(s) × ${perPage} = up to ${totalPages * perPage} people`
  );

  for (const person of firstPage.people) {
    if (!seen.has(person.id)) {
      seen.add(person.id);
      allPeople.push(person);
    }
  }

  onProgress?.(1, totalPages);

  for (let page = 2; page <= totalPages; page++) {
    onProgress?.(page, totalPages);
    await sleep(500);

    const result = await searchPeopleWithFilters(activeFilters, criteria, page, perPage);
    for (const person of result.people) {
      if (!seen.has(person.id)) {
        seen.add(person.id);
        allPeople.push(person);
      }
    }
  }

  return { people: allPeople, totalAvailable, apolloRelaxNote: relaxNote };
}

export function formatApolloPerson(person: ApolloPerson) {
  const org = person.organization;
  const location = [org?.city, org?.state, org?.country].filter(Boolean).join(", ");

  return {
    id: person.id,
    name: `${person.first_name || ""} ${person.last_name || ""}`.trim() || "Unknown",
    title: person.title || "N/A",
    company: org?.name || "Unknown",
    industry: org?.industry || "N/A",
    employees: org?.estimated_num_employees || 0,
    location: location || "N/A",
    email: person.email,
    linkedinUrl: person.linkedin_url,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
