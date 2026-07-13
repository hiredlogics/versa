export interface ApolloSearchFilters {
  personTitles: string[];
  personLocations: string[];
  qKeywords?: string;
  employeeRanges?: string[];
  includeSimilarTitles?: boolean;
}

export interface SearchCriteria {
  industry: string;
  country: string;
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
  email: string | null;
  linkedin_url: string | null;
  has_email?: boolean;
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
  linkedinUrl: string | null;
  score: number;
  reasoning: string;
  priority: "High" | "Medium" | "Low";
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
