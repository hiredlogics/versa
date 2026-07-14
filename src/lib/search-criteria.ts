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
};

/** Coerce AI JSON quirks (string vs array) into a clean string[]. */
export function asStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? item.split(/[,;|]/) : []))
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

const APOLLO_RANGE_RE = /^\d+,\d+$/;

function coerceEmployeeRangeList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    // Prefer splitting multiple ranges on ; | or whitespace — NOT commas (Apollo uses commas inside a range)
    return value
      .split(/[;|]+|\s{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Apollo expects "min,max" (comma). ChatGPT often returns "20-43" or invalid buckets. */
export function normalizeEmployeeRanges(
  value: unknown,
  fallbackMin = 10,
  fallbackMax = 500
): string[] {
  const raw = coerceEmployeeRangeList(value).map((r) =>
    r.replace(/\s+/g, "").replace(/^(\d+)-(\d+)$/, "$1,$2")
  );
  const valid = raw.filter((r) => APOLLO_RANGE_RE.test(r));
  if (valid.length > 0) return valid;
  return mapEmployeeRange(fallbackMin, fallbackMax);
}

export function normalizeLocations(locations: unknown): string[] {
  const cleaned = asStringArray(locations);
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

  const specific = cleaned.filter((l) => !generic.has(l.toLowerCase().trim()));
  if (specific.length > 0) return [specific[0]];

  return [cleaned[0]];
}

/** Apollo q_keywords works best with 1-2 industry terms — interests go to searchIntent for ranking */
export function splitKeywordsForApollo(
  qKeywords: string,
  searchIntent: string
): { apolloKeywords?: string; searchIntent: string } {
  const kw = qKeywords.trim();
  if (!kw) return { searchIntent };

  const parts = kw.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) {
    return { apolloKeywords: kw, searchIntent };
  }

  const apolloKeywords = parts.slice(0, 2).join(" ");
  const interestPart = parts.slice(2).join(" ");
  return {
    apolloKeywords,
    searchIntent: `${searchIntent} ${interestPart}`.trim(),
  };
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
  const personTitles = asStringArray(base.personTitles);
  const employeeRanges = normalizeEmployeeRanges(base.employeeRanges);
  const variants: ApolloQueryVariant[] = [];
  const seen = new Set<string>();

  function add(level: number, label: string, filters: ApolloSearchFilters) {
    const key = JSON.stringify({
      t: filters.personTitles,
      l: filters.personLocations,
      k: filters.qKeywords,
      e: filters.employeeRanges,
    });
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ level, label, filters });
  }

  const normalizedBase: ApolloSearchFilters = {
    ...base,
    personTitles: personTitles.length ? personTitles : ["Director"],
    personLocations: primaryLocation,
    employeeRanges: employeeRanges.length ? employeeRanges : undefined,
  };

  add(0, "exact AI filters", normalizedBase);

  if (normalizedBase.qKeywords) {
    add(1, "titles + location (interests ranked after fetch, no q_keywords)", {
      ...normalizedBase,
      personLocations: primaryLocation,
      qKeywords: undefined,
    });
  }

  if (normalizedBase.qKeywords && normalizedBase.qKeywords.includes(" ")) {
    const shortKw = normalizedBase.qKeywords.split(/\s+/).slice(0, 1).join(" ");
    add(2, `single industry keyword: "${shortKw}"`, {
      ...normalizedBase,
      personLocations: primaryLocation,
      qKeywords: shortKw,
    });
  }

  add(3, "titles + location only (no company size filter)", {
    ...normalizedBase,
    personLocations: primaryLocation,
    qKeywords: undefined,
    employeeRanges: undefined,
  });

  if (personTitles.length > 2) {
    add(4, "top 2 titles + location", {
      ...normalizedBase,
      personLocations: primaryLocation,
      personTitles: personTitles.slice(0, 2),
      qKeywords: undefined,
      employeeRanges: undefined,
    });
  }

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

  const personTitles =
    asStringArray(apolloIn.personTitles).length > 0
      ? asStringArray(apolloIn.personTitles)
      : asStringArray(parsed.jobTitles);

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

  const searchIntentBase = parsed.searchIntent || parsed.summary || userPrompt;
  const { apolloKeywords, searchIntent } = splitKeywordsForApollo(rawKeywords, searchIntentBase);

  const companySizeMin = parsed.companySizeMin ?? (openToWork ? 1 : 10);
  const companySizeMax = parsed.companySizeMax ?? 500;

  const employeeRanges = normalizeEmployeeRanges(
    apolloIn.employeeRanges,
    companySizeMin,
    companySizeMax
  );

  const apollo: ApolloSearchFilters = {
    personTitles:
      personTitles.length > 0
        ? personTitles
        : openToWork
          ? ["Software Engineer", "Developer", "Product Manager"]
          : ["Director"],
    personLocations,
    qKeywords: openToWork ? undefined : apolloKeywords,
    employeeRanges: openToWork
      ? ["11,50", "51,200", "201,500"]
      : employeeRanges,
    includeSimilarTitles: apolloIn.includeSimilarTitles !== false,
  };

  return {
    industry: parsed.industry || "Any",
    country: personLocations[0] || parsed.country || "United States",
    companySizeMin,
    companySizeMax,
    jobTitles: apollo.personTitles,
    keywords: rawKeywords || apolloKeywords || undefined,
    summary: parsed.summary || userPrompt.slice(0, 120),
    searchIntent,
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
    },
    null,
    2
  );
}
