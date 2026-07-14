export interface ApolloSearchConfig {
  perPage: number;
  maxPages: number;
  maxEnrich: number;
}

export interface LeadSearchConfig {
  maxResults: number;
  minScore: number;
  requireEmail: boolean;
}

export function getApolloSearchConfig(): ApolloSearchConfig {
  // Keep searches responsive: fewer pages + enrich only the top scored leads
  const perPage = Math.min(100, Math.max(25, parseInt(process.env.APOLLO_PER_PAGE || "50", 10)));
  const maxPages = Math.min(10, Math.max(1, parseInt(process.env.APOLLO_MAX_PAGES || "2", 10)));
  const maxEnrich = Math.min(
    200,
    Math.max(10, parseInt(process.env.APOLLO_MAX_ENRICH || "25", 10))
  );

  return { perPage, maxPages, maxEnrich };
}

/** maxResults=0 means use Apollo enrich cap as the practical return limit */
export function getLeadSearchConfig(): LeadSearchConfig {
  const maxResults = parseInt(process.env.LEAD_MAX_RESULTS || "25", 10);
  const minScore = Math.min(10, Math.max(1, parseInt(process.env.LEAD_MIN_SCORE || "5", 10)));
  const requireEmail = process.env.LEAD_REQUIRE_EMAIL === "true";

  return { maxResults: Math.max(0, maxResults), minScore, requireEmail };
}
