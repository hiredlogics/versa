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
  const perPage = Math.min(100, Math.max(25, parseInt(process.env.APOLLO_PER_PAGE || "100", 10)));
  const maxPages = Math.min(10, Math.max(1, parseInt(process.env.APOLLO_MAX_PAGES || "5", 10)));
  const maxEnrich = Math.min(
    1000,
    Math.max(10, parseInt(process.env.APOLLO_MAX_ENRICH || "500", 10))
  );

  return { perPage, maxPages, maxEnrich };
}

/** maxResults=0 means no cap — return all leads that pass the score filter */
export function getLeadSearchConfig(): LeadSearchConfig {
  const maxResults = parseInt(process.env.LEAD_MAX_RESULTS || "0", 10);
  const minScore = Math.min(10, Math.max(1, parseInt(process.env.LEAD_MIN_SCORE || "5", 10)));
  const requireEmail = process.env.LEAD_REQUIRE_EMAIL === "true";

  return { maxResults: Math.max(0, maxResults), minScore, requireEmail };
}
