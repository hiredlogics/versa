export interface ApolloSearchFilters {
  personTitles: string[];
  personLocations: string[];
  qKeywords?: string;
  employeeRanges?: string[];
  includeSimilarTitles?: boolean;
  /** Employer domains, e.g. ["apple.com"] for "people who work at Apple". */
  organizationDomains?: string[];
}

export interface SearchCriteria {
  industry: string;
  country: string;
  /** LLM-extracted location fields retained for display and auditing. */
  city?: string;
  state?: string;
  companySizeMin: number;
  companySizeMax: number;
  jobTitles: string[];
  keywords?: string;
  summary: string;
  searchIntent?: string;
  openToWork?: boolean;
  requireEmail?: boolean;
  excludedTitles?: string[];
  excludedIndustries?: string[];
  assumptionsUsedFromContext?: string[];
  explicitOverridesFromPrompt?: string[];
  /** AI-generated filters sent directly to Apollo API */
  apollo?: ApolloSearchFilters;
}

export interface LeadHistoryEntry {
  action: string;
  searchPrompt?: string;
  conversationTitle?: string;
  conversationId?: string;
  timestamp: string;
}

export interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  /** LinkedIn-style headline when the provider returns it (OTW signal scan). */
  headline?: string | null;
  email: string | null;
  /** Apollo email confidence: "verified" | "guessed" | "unavailable" | … */
  email_status?: string | null;
  linkedin_url: string | null;
  has_email?: boolean;
  /** Where the person is, which is what person_locations filters on. */
  city?: string;
  state?: string;
  country?: string;
  /** GitHub profile URL when Apollo includes it. */
  github_url?: string | null;
  /** Employment history from the enriched Apollo profile. */
  employment_history?: import("@/lib/lead-profile").ApolloEmploymentEntry[];
  seniority?: string | null;
  departments?: string[];
  organization?: {
    name: string;
    industry: string;
    estimated_num_employees: number;
    city: string;
    state: string;
    country: string;
  };
}

export interface ScoredLead {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  location: string;
  email: string | null;
  /** Provider email confidence: "verified" | "guessed" | null when unknown. */
  emailStatus?: string | null;
  linkedinUrl: string | null;
  score: number;
  reasoning: string;
  priority: "High" | "Medium" | "Low";
  recommendedApproach?: string | null;
  openToWork?: boolean;
  hasEmail?: boolean;
  searchPrompt?: string;
  searchTitle?: string;
  history?: LeadHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface LeadSearchSession {
  id: string;
  prompt: string;
  title?: string;
  criteria: SearchCriteria;
  leads: ScoredLead[];
  createdAt: string;
}

export type ChatMessageType = "text" | "search" | "duplicate" | "follow_up";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type: ChatMessageType;
  session?: LeadSearchSession;
  duplicateOf?: {
    conversationId: string;
    title: string;
  };
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  leads: ScoredLead[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeysStatus {
  apollo: boolean;
  openai: boolean;
}

export interface SearchProgress {
  stage: "parsing" | "searching" | "scoring" | "filtering" | "saving" | "complete" | "error";
  message: string;
  current?: number;
  total?: number;
}

export type ChatIntent = "lead_search" | "follow_up" | "general";

export interface ChatIntentResult {
  intent: ChatIntent;
  isDuplicate: boolean;
  duplicatePrompt?: string;
  reasoning: string;
}

export interface LeadScoreResult {
  score: number;
  reasoning: string;
  priority: "High" | "Medium" | "Low";
}

export interface LeadScoreContext {
  openToWork?: boolean;
  requireEmail?: boolean;
  keywords?: string;
  searchIntent?: string;
  originalPrompt?: string;
  leadContext?: import("@/lib/validations/onboarding-context").UserLeadContextDTO | null;
  excludedTitles?: string[];
  excludedIndustries?: string[];
}
