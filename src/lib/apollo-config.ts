/** Apollo People API Search hard ceiling: 100/page × 500 pages. */
export const APOLLO_HARD_MAX_PAGES = 500;
export const APOLLO_HARD_MAX_RECORDS = 50_000;

/** People processed per user-approved batch. One click, one batch. */
export const LEAD_BATCH_SIZE = clampBatchSize(process.env.LEAD_BATCH_SIZE);

/** Search pages one batch may read before giving up on a bad filter. */
export const PAGE_BUDGET_PER_BATCH = 10;

function clampBatchSize(raw: string | undefined): number {
  const parsed = parseInt(raw || "", 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(200, Math.max(10, parsed));
}

export interface ApolloSearchConfig {
  perPage: number;
  maxPages: number;
  maxEnrich: number;
}

export interface LeadSearchConfig {
  minScore: number;
  requireEmail: boolean;
}

/**
 * Each prompt is searched on its own; the saved onboarding ICP is never blended
 * into the filters, so one prompt cannot silently inherit another audience.
 */
export function shouldIgnoreLeadContext(): boolean {
  return true;
}

export function getApolloSearchConfig(): ApolloSearchConfig {
  return {
    perPage: 100,
    maxPages: PAGE_BUDGET_PER_BATCH,
    maxEnrich: LEAD_BATCH_SIZE,
  };
}

export function getLeadSearchConfig(): LeadSearchConfig {
  const minScore = Math.min(10, Math.max(1, parseInt(process.env.LEAD_MIN_SCORE || "5", 10)));
  const requireEmail = process.env.LEAD_REQUIRE_EMAIL === "true";

  return { minScore, requireEmail };
}
