import type { SearchCriteria, ApolloSearchFilters } from "./types";

type ParsedPrompt = SearchCriteria & {
  apollo?: Partial<ApolloSearchFilters> & {
    personTitles?: string[];
    personLocations?: string[];
    qKeywords?: string;
    employeeRanges?: string[];
  };
};

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

export function normalizeLocations(locations: string[]): string[] {
  const cleaned = locations.filter(Boolean);
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

  add(0, "exact AI filters", base);

  if (base.qKeywords) {
    add(1, "titles + location (interests ranked after fetch, no q_keywords)", {
      ...base,
      personLocations: primaryLocation,
      qKeywords: undefined,
    });
  }

  if (base.qKeywords && base.qKeywords.includes(" ")) {
    const shortKw = base.qKeywords.split(/\s+/).slice(0, 1).join(" ");
    add(2, `single industry keyword: "${shortKw}"`, {
      ...base,
      personLocations: primaryLocation,
      qKeywords: shortKw,
    });
  }

  add(3, "titles + location only (no company size filter)", {
    ...base,
    personLocations: primaryLocation,
    qKeywords: undefined,
    employeeRanges: undefined,
  });

  if (base.personTitles.length > 2) {
    add(4, "top 2 titles + location", {
      ...base,
      personLocations: primaryLocation,
      personTitles: base.personTitles.slice(0, 2),
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
  const apolloIn: Partial<ApolloSearchFilters> = parsed.apollo ?? {};

  const personTitles =
    apolloIn.personTitles?.filter(Boolean) ||
    parsed.jobTitles?.filter(Boolean) ||
    [];

  const personLocations = normalizeLocations(
    apolloIn.personLocations?.filter(Boolean) ||
      (parsed.country ? [parsed.country] : ["United States"])
  );

  const rawKeywords = (apolloIn.qKeywords ?? parsed.keywords ?? "")
    .replace(/open to work/gi, "")
    .replace(/seeking opportunities/gi, "")
    .trim();

  const searchIntentBase = parsed.searchIntent || parsed.summary || userPrompt;
  const { apolloKeywords, searchIntent } = splitKeywordsForApollo(rawKeywords, searchIntentBase);

  const companySizeMin = parsed.companySizeMin ?? (openToWork ? 1 : 10);
  const companySizeMax = parsed.companySizeMax ?? 500;

  const employeeRanges =
    apolloIn.employeeRanges?.filter(Boolean) ||
    mapEmployeeRange(companySizeMin, companySizeMax);

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
