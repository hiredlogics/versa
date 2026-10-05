import { isUsableEmail } from "@/lib/apollo";
import { emailConfidence } from "@/lib/email-confidence";
import { normalizeTitle } from "@/lib/role-policy";
import { toStoredApolloProfile } from "@/lib/lead-profile";
import type { ApolloPerson } from "@/lib/types";

/**
 * Pure helpers for the shared lead pool (`LeadPoolPerson`). Kept free of
 * database access so matching and merge rules can be unit tested.
 */

export type PoolPersonInput = {
  apolloPersonId?: string | null;
  linkedinUrl?: string | null;
  name: string;
  title: string;
  headline?: string | null;
  company?: string | null;
  industry?: string | null;
  employees?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** Free-text location when the source has no city/state/country split. */
  location?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  /** True when Apollo was asked for this person's email, even if none came back. */
  emailChecked?: boolean;
  openToWorkSignal?: string | null;
  source: string;
  /** Trimmed profile snapshot for caching job history. */
  profile?: object | null;
};

/** The pool columns a merge can write. */
export type PoolPersonData = {
  apolloPersonId: string | null;
  linkedinUrl: string | null;
  name: string;
  title: string;
  titleNormalized: string;
  headline: string | null;
  company: string | null;
  industry: string | null;
  employees: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationText: string;
  email: string | null;
  emailStatus: string | null;
  emailCheckedAt: Date | null;
  openToWorkSignal: string | null;
  sources: string[];
  /** Trimmed profile snapshot; non-null beats null (never overwrite with null). */
  profile: object | null;
};

const PLACEHOLDER_VALUES = new Set(["", "n/a", "na", "unknown", "none", "null", "not collected"]);

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/**
 * One key per LinkedIn profile: `http://www.linkedin.com/in/Jane-Doe/?trk=x`
 * and `https://pk.linkedin.com/in/jane-doe` both become
 * `https://linkedin.com/in/jane-doe`. Returns null for non-profile URLs.
 */
export function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const match = value.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!match) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Keep the raw slug when it is not valid percent-encoding.
  }
  return `https://linkedin.com/in/${slug.toLowerCase()}`;
}

/** Lowercase, de-duplicated "city, state, country, free text" used for matching. */
export function buildLocationText(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    // "Chicago, Illinois, United States" contributes each piece separately.
    for (const piece of (part ?? "").split(",")) {
      const value = clean(piece)?.toLowerCase();
      if (value && !seen.has(value)) {
        seen.add(value);
        out.push(value);
      }
    }
  }
  return out.join(", ");
}

/** Deterministic backup for the AI's `requireEmail` flag. */
export function promptAsksForEmail(prompt: string): boolean {
  return /\b(e-?mails?|e-?mail address(es)?|contact (info|information|details))\b/i.test(prompt);
}

const EMAIL_RANK: Record<ReturnType<typeof emailConfidence>, number> = {
  missing: 0,
  guessed: 1,
  verified: 2,
};

/**
 * Combine what the pool already knows with a new sighting. Non-empty values
 * win over empty ones, newer non-empty values win over older ones, and an email
 * is only replaced by one of equal or higher confidence, so a verified address
 * is never overwritten by a guessed one.
 */
export function mergePoolPerson(
  existing: PoolPersonData | null,
  incoming: PoolPersonInput,
  now = new Date()
): PoolPersonData {
  const linkedinUrl = normalizeLinkedInUrl(incoming.linkedinUrl);
  const title = clean(incoming.title) ?? existing?.title ?? "Unknown";
  const city = clean(incoming.city) ?? existing?.city ?? null;
  const state = clean(incoming.state) ?? existing?.state ?? null;
  const country = clean(incoming.country) ?? existing?.country ?? null;
  const location = clean(incoming.location);

  const incomingEmail = isUsableEmail(incoming.email) ? incoming.email!.trim().toLowerCase() : null;
  const incomingStatus = incomingEmail ? clean(incoming.emailStatus)?.toLowerCase() ?? null : null;
  const incomingRank = EMAIL_RANK[emailConfidence(incomingEmail, incomingStatus)];
  const existingRank = EMAIL_RANK[emailConfidence(existing?.email, existing?.emailStatus)];
  const takeIncomingEmail = incomingEmail !== null && incomingRank >= existingRank;

  const sources = new Set(existing?.sources ?? []);
  sources.add(incoming.source);

  // Merge rule: a newer non-null profile replaces an older one; never overwrite with null.
  const mergedProfile = incoming.profile ?? existing?.profile ?? null;

  return {
    apolloPersonId: clean(incoming.apolloPersonId) ?? existing?.apolloPersonId ?? null,
    linkedinUrl: linkedinUrl ?? existing?.linkedinUrl ?? null,
    name: clean(incoming.name) ?? existing?.name ?? "Unknown",
    title,
    titleNormalized: normalizeTitle(title),
    headline: clean(incoming.headline) ?? existing?.headline ?? null,
    company: clean(incoming.company) ?? existing?.company ?? null,
    industry: clean(incoming.industry) ?? existing?.industry ?? null,
    employees:
      incoming.employees && incoming.employees > 0 ? incoming.employees : existing?.employees ?? null,
    city,
    state,
    country,
    locationText: buildLocationText([
      city,
      state,
      country,
      location,
      ...(existing?.locationText ? existing.locationText.split(", ") : []),
    ]),
    email: takeIncomingEmail ? incomingEmail : existing?.email ?? null,
    emailStatus: takeIncomingEmail ? incomingStatus : existing?.emailStatus ?? null,
    emailCheckedAt: incoming.emailChecked ? now : existing?.emailCheckedAt ?? null,
    openToWorkSignal: clean(incoming.openToWorkSignal) ?? existing?.openToWorkSignal ?? null,
    sources: [...sources].sort(),
    profile: mergedProfile,
  };
}

/** Map an Apollo search or match result into a pool record. */
export function poolInputFromApolloPerson(
  person: ApolloPerson,
  source: string,
  options: { emailChecked?: boolean } = {}
): PoolPersonInput {
  const org = person.organization;
  // Build a profile snapshot from the Apollo person data we already have.
  const rawProfile = {
    headline: person.headline ?? undefined,
    city: person.city,
    state: person.state,
    country: person.country,
    github_url: person.github_url ?? undefined,
    employment_history: person.employment_history,
    seniority: person.seniority ?? undefined,
    departments: person.departments,
  };
  return {
    apolloPersonId: person.id || null,
    linkedinUrl: person.linkedin_url,
    name: `${person.first_name || ""} ${person.last_name || ""}`.trim(),
    title: person.title,
    headline: person.headline ?? null,
    company: org?.name ?? null,
    industry: org?.industry ?? null,
    employees: org?.estimated_num_employees ?? null,
    city: person.city ?? null,
    state: person.state ?? null,
    country: person.country ?? null,
    email: person.email,
    emailStatus: person.email_status ?? null,
    emailChecked: options.emailChecked,
    source,
    profile: toStoredApolloProfile(rawProfile),
  };
}

/** The key a search uses to avoid returning the same person twice. */
export function poolPersonKey(person: {
  apolloPersonId?: string | null;
  linkedinUrl?: string | null;
}): string | null {
  return person.apolloPersonId || normalizeLinkedInUrl(person.linkedinUrl);
}

/** Every key a person can be recognised by within one search. */
export function poolPersonKeys(person: {
  apolloPersonId?: string | null;
  linkedinUrl?: string | null;
}): string[] {
  return [person.apolloPersonId, normalizeLinkedInUrl(person.linkedinUrl)].filter(
    (key): key is string => Boolean(key)
  );
}

const OPEN_TO_WORK_PHRASES = [
  "#opentowork",
  "open to work",
  "open to new opportunities",
  "open to opportunities",
  "actively seeking",
  "actively looking",
  "seeking new opportunities",
  "seeking a new role",
  "looking for opportunities",
  "looking for a new role",
  "looking for my next role",
  "available immediately",
  "immediately available",
  "looking for a job",
];

function detectOpenToWorkPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  return OPEN_TO_WORK_PHRASES.find((phrase) => lower.includes(phrase)) ?? null;
}

function countryFromLocation(location: string | null): string | null {
  const last = location?.split(",").pop()?.trim();
  return last && /^(united states|canada)$/i.test(last) ? last : null;
}

/** "Chicago, Illinois, United States" → city, state and country columns. */
export function splitLocation(
  location: string | null | undefined
): { city: string | null; state: string | null; country: string | null } {
  const parts = (location ?? "").split(",").map((part) => clean(part)).filter((part): part is string => Boolean(part));
  if (parts.length >= 3) return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
  if (parts.length === 2) return { city: null, state: parts[0], country: parts[1] };
  return { city: null, state: null, country: null };
}

/**
 * Map one row of a lead export into a pool record. Recognises the formats this
 * project has produced: the Serper pipeline (`profile_url`, `headline`), the
 * Apollo collector (`apollo_id` / `job_title`), the Open-to-Work finder export
 * (`Candidate Name`) and raw Apollo search exports (`id`, `has_email`).
 * Returns null for unknown formats and rows without an Apollo id or LinkedIn URL.
 */
export function poolInputFromCsvRow(row: Record<string, string>): PoolPersonInput | null {
  const get = (key: string) => clean(row[key]);
  let input: PoolPersonInput | null = null;

  if ("profile_url" in row && "headline" in row) {
    const text = `${row.headline ?? ""} ${row.snippet ?? ""}`;
    input = {
      linkedinUrl: get("profile_url"),
      name: get("name") ?? "Unknown",
      title: get("headline") ?? (get("field") ?? "").replace(/_/g, " "),
      headline: get("headline"),
      country: row.region === "united_states" ? "United States" : null,
      openToWorkSignal: detectOpenToWorkPhrase(text),
      source: "serper",
    };
  } else if ("job_title" in row && "open_to_work_signal" in row) {
    const location = get("person_location");
    input = {
      apolloPersonId: get("apollo_id"),
      linkedinUrl: get("linkedin_url"),
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      title: get("job_title") ?? "Unknown",
      headline: get("headline"),
      company: get("company_name"),
      industry: get("industry"),
      employees: Number.parseInt(row.employee_count ?? "", 10) || null,
      ...splitLocation(location),
      location,
      // The collector only searched the United States.
      country: countryFromLocation(location) ?? "United States",
      openToWorkSignal: get("open_to_work_signal"),
      source: "apollo_search",
    };
  } else if ("Candidate Name" in row) {
    const location = get("Location");
    input = {
      linkedinUrl: get("LinkedIn Profile URL"),
      name: get("Candidate Name") ?? "Unknown",
      title: get("Job Title") ?? get("Search Role") ?? "Unknown",
      company: get("Current Company"),
      ...splitLocation(location),
      location,
      country: countryFromLocation(location),
      email: get("Email Address"),
      openToWorkSignal: /^yes$/i.test(row["Open To Work"] ?? "")
        ? get("Detection Method") ?? "open to work"
        : null,
      source: "otw_finder",
    };
  } else if ("id" in row && "has_email" in row) {
    input = {
      apolloPersonId: get("id"),
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      title: get("title") ?? "Unknown",
      company: get("company_name"),
      // These exports came from United States searches.
      country: "United States",
      source: "apollo_search",
    };
  }

  if (!input || poolPersonKeys(input).length === 0) return null;
  return input;
}

/**
 * Lowercase location terms to match against `locationText`. The country alone
 * is not a term: it is matched against the `country` column instead, so a
 * country-wide search does not require the country word in free text.
 */
export function poolLocationTerms(personLocations: string[], country: string): string[] {
  const countryLower = country.trim().toLowerCase();
  return personLocations
    .map((place) => place.trim().toLowerCase())
    .filter((place) => place && place !== countryLower && !/^(us|usa|united states of america)$/.test(place));
}
