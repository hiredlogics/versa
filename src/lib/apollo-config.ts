/** Apollo People API Search hard ceiling: 100/page × 500 pages. */
export const APOLLO_HARD_MAX_PAGES = 500;
export const APOLLO_HARD_MAX_RECORDS = 50_000;

export interface ApolloSearchConfig {
  perPage: number;
  /** Pages to fetch; when fetchAll, equals APOLLO_HARD_MAX_PAGES (still clamped by Apollo total_pages). */
  maxPages: number;
  maxEnrich: number;
  /** Pull every available Apollo page for the query (up to 50k), not a small sample. */
  fetchAll: boolean;
}

export interface LeadSearchConfig {
  maxResults: number;
  minScore: number;
  requireEmail: boolean;
}

/** Default ON — each prompt is fully dynamic; saved onboarding ICP is not blended in. */
export function shouldIgnoreLeadContext(): boolean {
  return process.env.USE_LEAD_CONTEXT !== "true";
}

/**
 * When true (default with fetch-all), one prompt saves the full Apollo pull for that search.
 * Plan monthly credits still gate starting a search when BILLING_ENFORCE=true, but do not
 * truncate a single search to "20 remaining".
 */
export function allowFullSearchSave(fetchAll: boolean): boolean {
  if (process.env.ALLOW_FULL_SEARCH_SAVE === "false") return false;
  if (process.env.ALLOW_FULL_SEARCH_SAVE === "true") return true;
  return fetchAll;
}

export function getApolloSearchConfig(): ApolloSearchConfig {
  // Default: fetch ALL Apollo pages for the prompt (set APOLLO_FETCH_ALL=false to sample).
  const fetchAll = process.env.APOLLO_FETCH_ALL !== "false";

  const perPage = Math.min(
    100,
    Math.max(25, parseInt(process.env.APOLLO_PER_PAGE || (fetchAll ? "100" : "50"), 10))
  );

  const rawPages = parseInt(process.env.APOLLO_MAX_PAGES || (fetchAll ? "0" : "4"), 10);
  const maxPages = fetchAll
    ? APOLLO_HARD_MAX_PAGES
    : Math.min(APOLLO_HARD_MAX_PAGES, Math.max(1, Number.isFinite(rawPages) && rawPages > 0 ? rawPages : 4));

  // Cap for legacy page enrich / sample mode (main job uses LEAD_PROCESS_BATCH_SIZE instead).
  const maxEnrich = Math.min(
    2000,
    Math.max(0, parseInt(process.env.APOLLO_MAX_ENRICH || "200", 10))
  );

  return { perPage, maxPages, maxEnrich, fetchAll };
}

/** maxResults=0 means save every lead from the Apollo fetch */
export function getLeadSearchConfig(): LeadSearchConfig {
  const maxResults = parseInt(process.env.LEAD_MAX_RESULTS || "0", 10);
  const minScore = Math.min(10, Math.max(1, parseInt(process.env.LEAD_MIN_SCORE || "5", 10)));
  const requireEmail = process.env.LEAD_REQUIRE_EMAIL === "true";

  return { maxResults: Math.max(0, maxResults), minScore, requireEmail };
}
