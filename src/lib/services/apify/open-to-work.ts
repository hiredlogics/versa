import { resolveEnvKey } from "@/lib/env";
import { hasOpenToWorkTitleSignal } from "@/lib/open-to-work";

/** Apollo returns up to 100 search results per page. */
export const MAX_OPEN_TO_WORK_SCAN = 5_000;

/** These are separate Apollo q_keywords searches, not enrichment calls. */
const JOB_SEEKER_KEYWORDS = [
  "open to work",
  "#opentowork",
  "seeking opportunities",
  "seeking new opportunities",
  "actively looking",
  "looking for a new role",
  "looking for work",
  "available immediately",
] as const;

export interface CandidateLead {
  /** Internal Apollo ID used only for the optional URL enrichment step. */
  apolloPersonId: string;
  name: string;
  title: string;
  company: string;
  location: string;
  linkedinUrl?: string;
  /** Every result is a possible match, never a verified LinkedIn badge. */
  isOpenToWork: true;
  otwSignal: "apolloKeyword" | "titleHeadline";
  matchedKeywords: string[];
  linkedinEnrichment: "not_requested" | "found" | "unavailable";
  checkedAt: string;
}

export interface OpenToWorkSearchParams {
  role: string;
  location?: string;
  /** Maximum number of unique Apollo search results to collect. */
  count?: number;
  /** Explicit user approval to spend credits only for LinkedIn URL lookup. */
  enrichLinkedInUrls?: boolean;
  /** Safety cap for the paid lookup; 1 credit/person is the working budget. */
  enrichLimit?: number;
}

export interface OpenToWorkSearchResult {
  candidates: CandidateLead[];
  scanned: number;
  scanLimit: number;
  enrichedForLinkedInUrl: number;
}

type ApolloSearchPerson = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  headline?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  organization?: { name?: string };
};

function buildSearchUrl(params: {
  role: string;
  location: string;
  page: number;
  perPage: number;
  keyword: string;
}): string {
  const url = new URL("https://api.apollo.io/api/v1/mixed_people/api_search");
  url.searchParams.append("person_titles[]", params.role);
  url.searchParams.append("person_locations[]", params.location);
  url.searchParams.set("include_similar_titles", "true");
  url.searchParams.set("q_keywords", params.keyword);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("per_page", String(params.perPage));
  return url.toString();
}

async function fetchApolloSearchPage(
  apiKey: string,
  params: Parameters<typeof buildSearchUrl>[0]
): Promise<ApolloSearchPerson[] | null> {
  const response = await fetch(buildSearchUrl(params), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
  });
  if (!response.ok) {
    console.warn(`[OpenToWork] Apollo keyword search failed (${response.status}) for "${params.keyword}"`);
    return null;
  }
  const data = (await response.json()) as { people?: ApolloSearchPerson[] };
  return data.people ?? [];
}

/**
 * Optional paid step. No email, personal email, phone, or waterfall options
 * are requested; we read and retain only `linkedin_url` from the response.
 */
async function enrichLinkedInUrls(
  apiKey: string,
  personIds: string[]
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const batchSize = 10;

  for (let index = 0; index < personIds.length; index += batchSize) {
    const details = personIds.slice(index, index + batchSize).map((id) => ({ id }));
    const response = await fetch(
      "https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ details }),
      }
    );
    if (!response.ok) {
      console.warn(`[OpenToWork] LinkedIn URL enrichment failed (${response.status}) for batch ${index / batchSize + 1}`);
      continue;
    }
    const data = (await response.json()) as {
      matches?: Array<{ id?: string; linkedin_url?: string | null } | null>;
    };
    for (const person of data.matches ?? []) {
      if (
        person?.id &&
        typeof person.linkedin_url === "string" &&
        person.linkedin_url.includes("linkedin.com/in/")
      ) {
        urls.set(person.id, person.linkedin_url);
      }
    }
  }
  return urls;
}

/**
 * Uses only Apollo People Search (zero lead credits): role + location stay
 * fixed, and each job-seeking phrase is searched independently. We never call
 * people/match or people/bulk_match, so no email/phone/profile unlock happens.
 */
export async function searchAndVerifyOpenToWorkCandidates(
  params: OpenToWorkSearchParams
): Promise<OpenToWorkSearchResult> {
  const scanLimit = Math.min(Math.max(params.count || 10, 1), MAX_OPEN_TO_WORK_SCAN);
  const enrichLimit = Math.min(Math.max(params.enrichLimit || 50, 1), 100);
  const role = params.role || "Software Engineer";
  const location = params.location || "United States";
  const apiKey = resolveEnvKey("APOLLO_API_KEY");
  if (!apiKey) return { candidates: [], scanned: 0, scanLimit, enrichedForLinkedInUrl: 0 };

  const people = new Map<string, ApolloSearchPerson>();
  const keywordsById = new Map<string, Set<string>>();
  const perKeywordBudget = Math.max(1, Math.ceil(scanLimit / JOB_SEEKER_KEYWORDS.length));

  for (const keyword of JOB_SEEKER_KEYWORDS) {
    let collectedForKeyword = 0;
    const pages = Math.ceil(perKeywordBudget / 100);

    for (let page = 1; page <= pages && collectedForKeyword < perKeywordBudget; page++) {
      const pagePeople = await fetchApolloSearchPage(apiKey, {
        role,
        location,
        keyword,
        page,
        perPage: Math.min(100, perKeywordBudget - collectedForKeyword),
      });
      if (!pagePeople?.length) break;

      for (const person of pagePeople) {
        if (!person.id) continue;
        const keywordSet = keywordsById.get(person.id) ?? new Set<string>();
        keywordSet.add(keyword);
        keywordsById.set(person.id, keywordSet);

        if (!people.has(person.id) && people.size < scanLimit) {
          people.set(person.id, person);
          collectedForKeyword++;
        }
      }
    }
  }

  const checkedAt = new Date().toISOString();
  const candidates = [...people.entries()].map(([id, person]): CandidateLead => {
    const titleHeadlineMatch = hasOpenToWorkTitleSignal({
      title: person.title,
      headline: person.headline,
    });
    const matchedKeywords = [...(keywordsById.get(id) ?? [])];

    const linkedinUrl =
      typeof person.linkedin_url === "string" && person.linkedin_url.includes("linkedin.com/in/")
        ? person.linkedin_url
        : undefined;
    return {
      apolloPersonId: id,
      name:
        person.name ||
        `${person.first_name ?? ""} ${person.last_name ?? person.last_name_obfuscated ?? ""}`.trim() ||
        "Candidate",
      title: person.title || role,
      company: person.organization?.name || "Unknown",
      location: [person.city, person.state, person.country].filter(Boolean).join(", ") || location,
      linkedinUrl,
      isOpenToWork: true,
      otwSignal: titleHeadlineMatch ? "titleHeadline" : "apolloKeyword",
      matchedKeywords,
      linkedinEnrichment: "not_requested",
      checkedAt,
    };
  });

  let enrichedForLinkedInUrl = 0;
  if (params.enrichLinkedInUrls && candidates.length > 0) {
    const selected = candidates.slice(0, enrichLimit);
    enrichedForLinkedInUrl = selected.length;
    const urls = await enrichLinkedInUrls(apiKey, selected.map((candidate) => candidate.apolloPersonId));
    for (const candidate of selected) {
      const linkedinUrl = urls.get(candidate.apolloPersonId);
      candidate.linkedinUrl = linkedinUrl;
      candidate.linkedinEnrichment = linkedinUrl ? "found" : "unavailable";
    }
  }

  console.log(
    `[OpenToWork] search-only: role="${role}" location="${location}" ` +
      `uniqueResults=${people.size} possibleMatches=${candidates.length} urlEnriched=${enrichedForLinkedInUrl}`
  );
  return { candidates, scanned: people.size, scanLimit, enrichedForLinkedInUrl };
}

export function convertCandidatesToCsv(candidates: CandidateLead[]): string {
  const headers = [
    "Candidate Name",
    "Job Title",
    "Company",
    "Location",
    "LinkedIn Profile URL",
    "Open To Work Status",
    "Match Source",
    "Matched Keywords",
    "LinkedIn URL Lookup",
    "Checked Date",
  ];
  const esc = (value: string | undefined | null) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = candidates.map((candidate) => [
    esc(candidate.name),
    esc(candidate.title),
    esc(candidate.company),
    esc(candidate.location),
    esc(candidate.linkedinUrl),
    esc("POSSIBLE — not LinkedIn badge verified"),
    esc(candidate.otwSignal === "titleHeadline" ? "Apollo title/headline" : "Apollo q_keywords"),
    esc(candidate.matchedKeywords.join("; ")),
    esc(candidate.linkedinEnrichment),
    esc(candidate.checkedAt.split("T")[0]),
  ]);
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
