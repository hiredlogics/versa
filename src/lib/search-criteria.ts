import type { SearchCriteria, ApolloSearchFilters } from "./types";

type ParsedPrompt = SearchCriteria & {
  apollo?: Partial<ApolloSearchFilters> & {
    personTitles?: string[] | string;
    personLocations?: string[] | string;
    qKeywords?: string | string[];
    employeeRanges?: string[] | string;
  };
  jobTitles?: string[] | string;
  country?: string;
  industry?: string;
};

/** Coerce AI JSON quirks (string vs array) into a clean string[]. */
export function asStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? [item] : []))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

const TECH_TITLES_FOR_INDUSTRY_GUARD = [
  "cto",
  "cio",
  "vp engineering",
  "vice president engineering",
  "head of engineering",
  "director of engineering",
  "software engineer",
  "head of product",
  "vp product",
  "engineering manager",
];

const REAL_ESTATE_TITLES = [
  "Broker",
  "Managing Broker",
  "Property Manager",
  "Real Estate Investor",
  "Founder",
  "CEO",
];

/** HR / People Ops titles — "HR" alone is too vague for Apollo and balloons the pool. */
export const HR_TITLES = [
  "HR Manager",
  "Human Resources Manager",
  "Head of People",
  "People Operations Manager",
  "CHRO",
  "Talent Acquisition Manager",
];

function isHrRoleSearch(
  industry?: string,
  userPrompt?: string,
  keywords?: string,
  titles?: string[]
): boolean {
  const blob = `${industry || ""} ${userPrompt || ""} ${keywords || ""} ${(titles || []).join(" ")}`.toLowerCase();
  return /\b(hr|human resources|people ops|people operations|talent acquisition|recruiter|chro)\b/.test(
    blob
  );
}

function alignHrTitles(titles: string[]): string[] {
  const cleaned = titles.filter((title) => {
    const lower = title.toLowerCase().trim();
    // Bare "HR" / "Human Resources" is not a useful Apollo person_titles value alone
    return lower !== "hr" && lower !== "human resources" && lower !== "hr professional";
  });

  const merged = [...cleaned];
  for (const title of HR_TITLES) {
    if (merged.length >= 5) break;
    if (!merged.some((t) => t.toLowerCase() === title.toLowerCase())) {
      merged.push(title);
    }
  }

  return (merged.length > 0 ? merged : HR_TITLES).slice(0, 5);
}

/** Stable Apollo title set when the user asks for software engineers / developers. */
export const SOFTWARE_ENGINEER_TITLES = [
  "Software Engineer",
  "Developer",
  "Software Developer",
  "Full Stack Engineer",
  "Backend Engineer",
];

const ENGINEER_TITLE_SYNONYMS = [
  "software engineer",
  "developer",
  "programmer",
  "software developer",
  "full stack",
  "fullstack",
  "backend engineer",
  "front end engineer",
  "frontend engineer",
  "software architect",
  "technical lead",
  "tech lead",
  "engineering manager",
  "sde",
  "swe",
];

function isRealEstateIndustry(industry?: string, prompt?: string, keywords?: string): boolean {
  const blob = `${industry || ""} ${prompt || ""} ${keywords || ""}`.toLowerCase();
  return /real\s*estate|real\s*state|propert(y|ies)|brokerage|realtor/.test(blob);
}

function wantsSoftwareEngineers(prompt?: string, industry?: string, titles?: string[]): boolean {
  const blob = `${prompt || ""} ${industry || ""} ${(titles || []).join(" ")}`.toLowerCase();
  return /software\s*engineer|developers?|programmers?|full\s*stack|backend engineer|frontend engineer/.test(
    blob
  );
}

/**
 * Stabilize IC titles when searching software engineers so ChatGPT synonyms
 * (Software Architect vs Engineering Manager) don't change Apollo results run-to-run.
 */
export function normalizeSoftwareEngineerTitles(
  titles: string[],
  userPrompt?: string,
  industry?: string
): string[] {
  if (!wantsSoftwareEngineers(userPrompt, industry, titles)) {
    return titles.slice(0, 5);
  }

  const hasEngineerSignal = titles.some((title) => {
    const lower = title.toLowerCase();
    return ENGINEER_TITLE_SYNONYMS.some((syn) => lower.includes(syn));
  });

  if (!hasEngineerSignal && !wantsSoftwareEngineers(userPrompt, industry)) {
    return titles.slice(0, 5);
  }

  return [...SOFTWARE_ENGINEER_TITLES];
}

/** Drop software titles when searching an industry like real estate. */
export function alignTitlesToIndustry(
  titles: string[],
  industry?: string,
  userPrompt?: string,
  keywords?: string
): string[] {
  if (isRealEstateIndustry(industry, userPrompt, keywords)) {
    const cleaned = titles.filter((title) => {
      const lower = title.toLowerCase();
      return !TECH_TITLES_FOR_INDUSTRY_GUARD.some((bad) => lower.includes(bad));
    });

    const merged = [...cleaned];
    for (const title of REAL_ESTATE_TITLES) {
      if (merged.length >= 5) break;
      if (!merged.some((t) => t.toLowerCase() === title.toLowerCase())) {
        merged.push(title);
      }
    }

    return (merged.length > 0 ? merged : REAL_ESTATE_TITLES).slice(0, 5);
  }

  if (isHrRoleSearch(industry, userPrompt, keywords, titles)) {
    return alignHrTitles(titles);
  }

  return normalizeSoftwareEngineerTitles(titles, userPrompt, industry).slice(0, 5);
}

export const APOLLO_EMPLOYEE_BUCKETS = [
  "1,10",
  "11,50",
  "51,200",
  "201,500",
  "501,1000",
  "1001,5000",
] as const;

export function mapEmployeeRange(min: number, max: number): string[] {
  const ranges: string[] = [];
  if (min <= 10 && max >= 1) ranges.push("1,10");
  if (min <= 50 && max >= 11) ranges.push("11,50");
  if (min <= 200 && max >= 51) ranges.push("51,200");
  if (min <= 500 && max >= 201) ranges.push("201,500");
  if (min <= 1000 && max >= 501) ranges.push("501,1000");
  if (max >= 1001) ranges.push("1001,5000");
  return ranges.length > 0 ? ranges : ["11,50", "51,200", "201,500"];
}

function coerceEmployeeRangeList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;|]+|\s{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseRangeBounds(range: string): { min: number; max: number } | null {
  const normalized = range.replace(/\s+/g, "").replace(/^(\d+)-(\d+)$/, "$1,$2");
  const match = normalized.match(/^(\d+),(\d+)$/);
  if (!match) return null;
  return { min: Number(match[1]), max: Number(match[2]) };
}

/** Snap any AI range to official Apollo buckets that cover the requested sizes. */
export function normalizeEmployeeRanges(
  value: unknown,
  fallbackMin = 10,
  fallbackMax = 500
): string[] {
  const raw = coerceEmployeeRangeList(value);
  if (raw.length === 0) return mapEmployeeRange(fallbackMin, fallbackMax);

  const covered = new Set<string>();
  for (const entry of raw) {
    const bounds = parseRangeBounds(entry);
    if (!bounds) continue;
    for (const bucket of APOLLO_EMPLOYEE_BUCKETS) {
      const b = parseRangeBounds(bucket)!;
      if (bounds.min <= b.max && bounds.max >= b.min) covered.add(bucket);
    }
  }

  if (covered.size > 0) return [...covered];
  return mapEmployeeRange(fallbackMin, fallbackMax);
}

/** Keep the OR list small so the pool stays intentional. */
const MAX_PERSON_LOCATIONS = 3;

export function normalizeLocations(locations: unknown): string[] {
  const cleaned = asStringArray(locations).map((loc) => {
    const lower = loc.toLowerCase().trim();
    if (lower === "us" || lower === "usa" || lower === "u.s." || lower === "u.s.a.") {
      return "United States";
    }
    if (lower === "uk" || lower === "u.k.") return "United Kingdom";
    if (
      lower === "ny" ||
      lower === "n.y." ||
      lower === "n.y" ||
      lower === "nyc" ||
      lower === "new york city" ||
      lower === "new york, ny" ||
      lower === "new york"
    ) {
      return "New York";
    }
    return loc.trim();
  });
  if (cleaned.length <= 1) return cleaned.length ? cleaned : ["United States"];

  const generic = new Set([
    "united states",
    "usa",
    "us",
    "united kingdom",
    "uk",
    "canada",
    "europe",
  ]);

  const seen = new Set<string>();
  const deduped = cleaned.filter((l) => {
    const key = l.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Several sibling regions are a legitimate OR for people search; a country
  // alongside one of its own states/cities is redundant, so drop the country.
  const specific = deduped.filter((l) => !generic.has(l.toLowerCase().trim()));
  if (specific.length > 0) return specific.slice(0, MAX_PERSON_LOCATIONS);

  return [deduped[0]];
}

const KNOWN_INDUSTRY_PHRASES = [
  "real estate",
  "property management",
  "property development",
  "e-commerce",
  "ecommerce",
  "human resources",
  "private equity",
  "venture capital",
  "investment banking",
  "oil and gas",
  "food and beverage",
  "machine learning",
];

/**
 * Company stage/structure words. q_keywords matches company names, so sending
 * "startups" returns people at firms literally called "* Startups" instead of
 * actual startups. Stage belongs in employee ranges, never in keywords.
 */
const COMPANY_STAGE_WORDS = new Set([
  "startup",
  "startups",
  "start-up",
  "start-ups",
  "smb",
  "smbs",
  "sme",
  "smes",
  "company",
  "companies",
  "business",
  "businesses",
  "firm",
  "firms",
  "enterprise",
  "enterprises",
  "organization",
  "organizations",
  "organisation",
  "organisations",
  "scaleup",
  "scaleups",
  "unicorn",
  "unicorns",
]);

/** Startup-sized employee buckets, used when the prompt says "startup". */
export const STARTUP_EMPLOYEE_RANGES = ["1,10", "11,50"];

/** Accept "apple.com", "Apple.com", "https://apple.com/jobs" → "apple.com". */
export function normalizeDomains(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of asStringArray(value)) {
    const clean = entry
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim();
    if (!clean || !clean.includes(".") || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 10) break;
  }

  return out;
}

export function isCompanyStageWord(word: string): boolean {
  return COMPANY_STAGE_WORDS.has(word.trim().toLowerCase());
}

/** Drop stage words so they never reach q_keywords. */
function stripCompanyStageWords(value: string): string {
  return value
    .split(/[^a-z0-9+&-]+/i)
    .filter((word) => word && !isCompanyStageWord(word))
    .join(" ")
    .trim();
}

const NEED_WORDS = new Set([
  "automation",
  "ai",
  "chatbot",
  "chatbots",
  "need",
  "needs",
  "interested",
  "looking",
  "hiring",
  "software",
  "platform",
  "tools",
]);

/**
 * Build Apollo q_keywords from industry (preferred) + AI keywords.
 * Keeps multi-word industry phrases; moves "needs" like automation into searchIntent.
 */
export function resolveApolloKeywords(input: {
  qKeywords?: string;
  industry?: string;
  searchIntent?: string;
  userPrompt?: string;
}): { apolloKeywords?: string; searchIntent: string } {
  let searchIntent = (input.searchIntent || input.userPrompt || "").trim();

  const industryInput =
    input.industry && input.industry.trim() && input.industry.trim().toLowerCase() !== "any"
      ? input.industry.trim()
      : "";

  // "AI startups" must search AI, not company names containing "Startups".
  const industry = stripCompanyStageWords(industryInput);
  const raw = stripCompanyStageWords((input.qKeywords || "").trim());

  // Prefer explicit industry when it looks like a domain, not a need-word blob
  if (industry && !NEED_WORDS.has(industry.toLowerCase())) {
    const phrase = industry.toLowerCase();
    // Keep known phrases intact; otherwise use up to 3 words from industry
    const known = KNOWN_INDUSTRY_PHRASES.find((p) => phrase.includes(p));
    const apolloKeywords = known || industry.split(/[\/,]/)[0].trim().slice(0, 40);
    if (raw && !searchIntent.toLowerCase().includes(raw.toLowerCase())) {
      searchIntent = `${searchIntent} ${raw}`.trim();
    }
    return { apolloKeywords, searchIntent };
  }

  if (!raw) return { searchIntent };

  const lower = raw.toLowerCase().replace(/,/g, " ");
  const known = KNOWN_INDUSTRY_PHRASES.find((p) => lower.includes(p));
  if (known) {
    const leftover = lower
      .replace(known, " ")
      .split(/\s+/)
      .filter((w) => w && !NEED_WORDS.has(w) && w !== "and");
    if (leftover.length) {
      searchIntent = `${searchIntent} ${leftover.join(" ")}`.trim();
    }
    // Move need-words into intent
    for (const w of lower.split(/\s+/)) {
      if (NEED_WORDS.has(w) && !searchIntent.toLowerCase().includes(w)) {
        searchIntent = `${searchIntent} ${w}`.trim();
      }
    }
    return { apolloKeywords: known, searchIntent };
  }

  // Fallback: strip need words, keep 1–2 domain tokens
  const tokens = lower
    .split(/[^a-z0-9+-]+/)
    .filter((w) => w.length > 1 && !NEED_WORDS.has(w));

  if (tokens.length === 0) {
    // Everything was a "need" — keep as intent, no q_keywords
    if (!searchIntent.toLowerCase().includes(lower)) {
      searchIntent = `${searchIntent} ${raw}`.trim();
    }
    return { searchIntent };
  }

  const apolloKeywords = tokens.slice(0, 2).join(" ");
  const extra = tokens.slice(2).join(" ");
  if (extra) searchIntent = `${searchIntent} ${extra}`.trim();
  return { apolloKeywords, searchIntent };
}

/** @deprecated use resolveApolloKeywords — kept for existing tests */
export function splitKeywordsForApollo(
  qKeywords: string,
  searchIntent: string
): { apolloKeywords?: string; searchIntent: string } {
  return resolveApolloKeywords({ qKeywords, searchIntent });
}

export interface ApolloQueryVariant {
  level: number;
  label: string;
  filters: ApolloSearchFilters;
}

export function buildApolloSearchVariants(criteria: SearchCriteria): ApolloQueryVariant[] {
  const base = criteria.apollo;
  if (!base) return [];

  const primaryLocation = normalizeLocations(base.personLocations);
  const personTitles = asStringArray(base.personTitles).slice(0, 5);
  const employeeRanges = normalizeEmployeeRanges(
    base.employeeRanges,
    criteria.companySizeMin,
    criteria.companySizeMax
  );
  const industryKeyword = base.qKeywords?.trim() || undefined;

  const variants: ApolloQueryVariant[] = [];
  const seen = new Set<string>();

  // When the user named an employer, that is the search. Relaxing may widen
  // titles or size, but never the company — otherwise "people at Apple" comes
  // back as people at any tech company.
  const organizationDomains = normalizeDomains(base.organizationDomains);
  const pinned: Partial<ApolloSearchFilters> =
    organizationDomains.length > 0
      ? { organizationDomains, employeeRanges: undefined, qKeywords: undefined }
      : {};

  function add(level: number, label: string, filters: ApolloSearchFilters) {
    const merged = { ...filters, ...pinned };
    const key = JSON.stringify({
      t: merged.personTitles,
      l: merged.personLocations,
      k: merged.qKeywords,
      e: merged.employeeRanges,
      d: merged.organizationDomains,
    });
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ level, label, filters: merged });
  }

  const titles = personTitles.length ? personTitles : ["Director", "Founder", "CEO"];

  const exact: ApolloSearchFilters = {
    personTitles: titles,
    personLocations: primaryLocation,
    qKeywords: industryKeyword,
    employeeRanges,
    includeSimilarTitles: base.includeSimilarTitles !== false,
  };

  // 0 — exact AI filters (industry keyword kept)
  add(0, "exact AI filters", exact);

  // 1 — broaden company-size buckets, KEEP industry keyword
  add(1, "industry + titles + wider company size", {
    ...exact,
    employeeRanges: ["11,50", "51,200", "201,500"],
  });

  // 2 — drop company size only, KEEP industry keyword
  add(2, "industry + titles + location (no size filter)", {
    ...exact,
    employeeRanges: undefined,
  });

  // 3 — fewer titles, KEEP industry keyword
  if (titles.length > 2) {
    add(3, "industry + top titles + location", {
      ...exact,
      personTitles: titles.slice(0, 3),
      employeeRanges: undefined,
    });
  }

  // 4 — shorten keyword to primary industry token only if multi-word
  if (industryKeyword && industryKeyword.includes(" ")) {
    add(4, `primary industry keyword: "${industryKeyword.split(/\s+/)[0]}"`, {
      ...exact,
      qKeywords: industryKeyword.split(/\s+/).slice(0, 2).join(" "),
      employeeRanges: undefined,
    });
  }

  // 5 — LAST resort: drop keyword (score by searchIntent after fetch)
  add(5, "titles + location only (industry ranked after fetch)", {
    personTitles: titles.slice(0, 3),
    personLocations: primaryLocation,
    qKeywords: undefined,
    employeeRanges: undefined,
    includeSimilarTitles: true,
  });

  return variants;
}

export function normalizeSearchCriteria(
  parsed: ParsedPrompt,
  userPrompt: string
): SearchCriteria {
  const openToWork = parsed.openToWork ?? false;
  const apolloIn = (parsed.apollo ?? {}) as {
    personTitles?: unknown;
    personLocations?: unknown;
    qKeywords?: unknown;
    employeeRanges?: unknown;
    includeSimilarTitles?: boolean;
  };

  const personLocations = normalizeLocations(
    asStringArray(apolloIn.personLocations).length > 0
      ? apolloIn.personLocations
      : parsed.country
        ? [parsed.country]
        : ["United States"]
  );

  const rawKeywordSource =
    typeof apolloIn.qKeywords === "string"
      ? apolloIn.qKeywords
      : Array.isArray(apolloIn.qKeywords)
        ? apolloIn.qKeywords.filter((v): v is string => typeof v === "string").join(" ")
        : typeof parsed.keywords === "string"
          ? parsed.keywords
          : "";

  const rawKeywords = rawKeywordSource
    .replace(/open to work/gi, "")
    .replace(/seeking opportunities/gi, "")
    .trim();

  const personTitles = alignTitlesToIndustry(
    (asStringArray(apolloIn.personTitles).length > 0
      ? asStringArray(apolloIn.personTitles)
      : asStringArray(parsed.jobTitles)
    ).slice(0, 5),
    parsed.industry,
    userPrompt,
    rawKeywords
  );

  const searchIntentBase =
    parsed.searchIntent || parsed.summary || userPrompt;

  const { apolloKeywords, searchIntent } = resolveApolloKeywords({
    qKeywords: rawKeywords,
    industry: parsed.industry,
    searchIntent: searchIntentBase,
    userPrompt,
  });

  // Ensure full prompt intent is preserved for scoring / outreach
  const fullIntent =
    userPrompt && !searchIntent.toLowerCase().includes(userPrompt.toLowerCase().slice(0, 40))
      ? `${searchIntent}. Original request: ${userPrompt}`.trim()
      : searchIntent;

  const companySizeMin = parsed.companySizeMin ?? 10;
  const companySizeMax = parsed.companySizeMax ?? 500;

  const employeeRanges = normalizeEmployeeRanges(
    apolloIn.employeeRanges,
    companySizeMin,
    companySizeMax
  );

  // Prefer slightly broader buckets when AI only returns very-small "1,10" for "small companies"
  if (
    employeeRanges.length === 1 &&
    employeeRanges[0] === "1,10" &&
    /small|startup|smb|sme/i.test(`${userPrompt} ${searchIntentBase}`)
  ) {
    employeeRanges.push("11,50");
  }

  // "Startup" is a size, not a keyword: express it as headcount instead of
  // letting the word match company names.
  const wantsStartups = /\bstart-?ups?\b/i.test(`${userPrompt} ${searchIntentBase}`);
  if (wantsStartups && employeeRanges.length > STARTUP_EMPLOYEE_RANGES.length) {
    employeeRanges.splice(0, employeeRanges.length, ...STARTUP_EMPLOYEE_RANGES);
  }

  /**
   * Open-to-work is NOT an Apollo API filter (no person_open_to_work / similar param).
   * Previously we dropped qKeywords and forced huge employee ranges, which ballooned
   * pools (e.g. ~3.5M for "NY HR open to work"). Keep titles + location + keywords tight.
   */
  let finalTitles =
    personTitles.length > 0
      ? personTitles
      : openToWork
        ? alignTitlesToIndustry([], parsed.industry, userPrompt, rawKeywords)
        : ["Founder", "CEO", "Director"];
  if (finalTitles.length === 0) {
    finalTitles = ["Director", "Manager", "Specialist"];
  }

  // Tighter matching for OTW / short role abbreviations — similar titles explode the pool
  const includeSimilar =
    openToWork || finalTitles.some((t) => /^(hr|manager|director|specialist)$/i.test(t.trim()))
      ? false
      : apolloIn.includeSimilarTitles !== false;

  const organizationDomains = normalizeDomains(
    (parsed as { companyDomains?: unknown }).companyDomains
  );

  const apollo: ApolloSearchFilters = {
    personTitles: finalTitles.slice(0, 5),
    personLocations,
    // Keep keywords for OTW — dropping them was a major cause of multi-million pools
    qKeywords: apolloKeywords || undefined,
    employeeRanges,
    includeSimilarTitles: includeSimilar,
  };

  // "People at Apple" is answered by the employer, so size and industry guesses
  // only shrink it — Apple alone fails an "1001,5000" bucket.
  if (organizationDomains.length > 0) {
    apollo.organizationDomains = organizationDomains;
    apollo.employeeRanges = undefined;
    apollo.qKeywords = undefined;
  }

  const otwIntentSuffix = openToWork
    ? " Note: open-to-work status cannot be filtered directly; matching professionals by title/location/keywords instead."
    : "";

  return {
    industry:
      parsed.industry && parsed.industry !== "Any"
        ? parsed.industry
        : isHrRoleSearch(parsed.industry, userPrompt, rawKeywords, finalTitles)
          ? "Human Resources"
          : parsed.industry || "Any",
    country: personLocations[0] || parsed.country || "United States",
    companySizeMin: companySizeMin,
    companySizeMax: companySizeMax,
    jobTitles: apollo.personTitles,
    keywords: apolloKeywords || rawKeywords || undefined,
    summary: parsed.summary || userPrompt.slice(0, 120),
    searchIntent: `${fullIntent}${otwIntentSuffix}`.trim(),
    openToWork,
    requireEmail: parsed.requireEmail ?? false,
    apollo,
  };
}

export function formatApolloFiltersLog(criteria: SearchCriteria): string {
  const a = criteria.apollo;
  if (!a) return JSON.stringify(criteria);

  return JSON.stringify(
    {
      person_titles: a.personTitles,
      person_locations: a.personLocations,
      q_keywords: a.qKeywords || null,
      organization_num_employees_ranges: a.employeeRanges,
      include_similar_titles: a.includeSimilarTitles,
      search_intent: criteria.searchIntent || null,
      industry: criteria.industry || null,
    },
    null,
    2
  );
}
