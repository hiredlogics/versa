import type { ParsedSearchCriteria } from "@/lib/validations/search-criteria";
import type { LeadRecord, PriorityLevel } from "@/lib/types/lead-finder";

export type SearchDisplayStatus =
  | "complete"
  | "running"
  | "failed"
  | "partial"
  | "no_leads";

export interface SearchLeadPreview {
  id: string;
  name: string;
  title: string;
  company: string;
  score: number;
  priorityLevel: PriorityLevel;
}

export interface SearchHistoryItem {
  id: string;
  prompt: string;
  status: string;
  displayStatus: SearchDisplayStatus;
  totalFound: number;
  totalQualified: number;
  averageScore: number | null;
  parsedCriteria: ParsedSearchCriteria | null;
  criteriaSummary: string[];
  topTitles: string[];
  topIndustries: string[];
  topLeads: SearchLeadPreview[];
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  relaxNote: string | null;
  errorMessage: string | null;
}

export interface SearchDetailResponse {
  search: {
    id: string;
    prompt: string;
    status: string;
    displayStatus: SearchDisplayStatus;
    parsedCriteria: ParsedSearchCriteria | null;
    criteriaSummary: string[];
    totalFound: number;
    totalQualified: number;
    averageScore: number | null;
    createdAt: string;
    updatedAt: string;
    durationMs: number | null;
    relaxNote: string | null;
    errorMessage: string | null;
    aiProviderUsed?: string | null;
    canResume?: boolean;
    leadsPreviewLimit?: number;
    leadsOffset?: number;
    jobRequirements?: unknown;
  };
  leads: LeadRecord[];
}

export type SearchSortOption = "newest" | "most_leads" | "highest_score";
export type SearchDateFilter = "all" | "7d" | "30d" | "90d";
export type SearchStatusFilter = "all" | SearchDisplayStatus;
