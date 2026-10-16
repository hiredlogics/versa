import type { SearchCriteria } from "@/lib/types";

const US_STATE_OR_TERRITORY = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire",
  "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia",
  "wisconsin", "wyoming", "district of columbia", "puerto rico",
]);

const US_ABBREVIATIONS = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in",
  "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv",
  "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn",
  "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc",
]);

const CANADIAN_PROVINCE_OR_TERRITORY = new Set([
  "alberta", "british columbia", "manitoba", "new brunswick", "newfoundland and labrador",
  "northwest territories", "nova scotia", "nunavut", "ontario", "prince edward island", "quebec",
  "saskatchewan", "yukon",
]);

const CANADIAN_ABBREVIATIONS = new Set([
  "ab", "bc", "mb", "nb", "nl", "nt", "ns", "nu", "on", "pe", "qc", "sk", "yt",
]);

// Only needed when a city name is supplied without a country/province. The AI parser
// remains the primary resolver for other cities; these remove common ambiguity safely.
const KNOWN_US_CITIES = new Set([
  "atlanta", "austin", "boston", "chicago", "dallas", "denver", "houston", "los angeles",
  "miami", "new york", "new york city", "philadelphia", "phoenix", "san diego", "san francisco",
  "seattle", "washington dc",
]);
const KNOWN_CANADIAN_CITIES = new Set([
  "calgary", "edmonton", "halifax", "montreal", "ottawa", "quebec city", "toronto", "vancouver",
  "victoria", "winnipeg",
]);

function canonicalCountry(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america"].includes(normalized || "")) {
    return "United States";
  }
  if (["canada", "ca"].includes(normalized || "")) return "Canada";
  return value?.trim() || null;
}

function hasPlace(places: string[], names: Set<string>, abbreviations: Set<string>): boolean {
  return places.some((place) => {
    const normalized = place.toLowerCase().replace(/[.]/g, " ").replace(/\s+/g, " ").trim();
    const words = normalized.split(/[^a-z]+/).filter(Boolean);
    return names.has(normalized) || words.some((word) => abbreviations.has(word)) ||
      [...names].some((name) => normalized.includes(name));
  });
}

/**
 * Normalizes the parsed country after AI parsing. A US state or Canadian
 * province is enough to infer its country; any explicitly requested country
 * remains available for profile discovery.
 */
export function resolveSupportedCountry(criteria: SearchCriteria): SearchCriteria {
  const places = criteria.apollo?.personLocations ?? [];
  const isUS = hasPlace(places, US_STATE_OR_TERRITORY, US_ABBREVIATIONS) ||
    places.some((place) => KNOWN_US_CITIES.has(place.trim().toLowerCase()));
  const isCanada = hasPlace(places, CANADIAN_PROVINCE_OR_TERRITORY, CANADIAN_ABBREVIATIONS) ||
    places.some((place) => KNOWN_CANADIAN_CITIES.has(place.trim().toLowerCase()));

  if (isUS && isCanada) throw new Error("Use one country per search.");
  if (isUS) return { ...criteria, country: "United States" };
  if (isCanada) return { ...criteria, country: "Canada" };

  const country = canonicalCountry(criteria.country);
  return country ? { ...criteria, country } : criteria;
}
