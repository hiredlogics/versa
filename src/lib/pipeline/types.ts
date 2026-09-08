/**
 * Query sent to the people-data provider. Structurally identical to the
 * vendor-specific type in the provider client module, which is the only place
 * the vendor's name legitimately appears. Nothing in this directory names it.
 */
export interface ProviderSearchFilters {
  personTitles: string[];
  personLocations: string[];
  qKeywords?: string;
  employeeRanges?: string[];
  includeSimilarTitles?: boolean;
  /** Employer domains, e.g. ["apple.com"] for "people who work at Apple". */
  organizationDomains?: string[];
}

/** What the AI extracted from the prompt. Produced once, reused by every batch. */
export interface Brief {
  intent: string;
  titles: string[];
  /** ONE place: country OR state OR city, never two. */
  location: string | null;
  industry: string | null;
  employeeRanges: string[];
  /** Needs and timing cues. For ranking and the why column only — never filters. */
  signals: string[];
  excludeTitles: string[];
  excludeIndustries: string[];
  requestedTotal: number;
  /**
   * Keep only people who say they are job-seeking in their own title or
   * headline. High precision, low recall: most job seekers never write it, so
   * this trades a long unreliable list for a short trustworthy one.
   */
  jobSeekingOnly?: boolean;
}

export type BriefGap = "titles" | "location" | "quantity" | "industry";

export interface Question {
  id: BriefGap;
  prompt: string;
  options: string[];
  allowMultiple?: boolean;
}

export type Understanding =
  | {
      status: "needs_clarification";
      brief: Partial<Brief>;
      gaps: BriefGap[];
      questions: Question[];
      /** Set once the same gap has been asked too many times. */
      exhausted?: boolean;
      note?: string;
    }
  | { status: "ready"; brief: Brief; note?: string };

/** A person from the provider's free search endpoint, before any credit is spent. */
export interface Candidate {
  providerId: string;
  name: string;
  title: string;
  company: string;
  industry: string | null;
  employees: number | null;
  location: string | null;
  linkedinUrl: string | null;
  /** Provider hinted an email exists; unconfirmed until unlocked. */
  emailLikely: boolean;
  headline: string | null;
}

export type RejectReason =
  | "duplicate"
  | "excluded_title"
  | "excluded_industry"
  | "title_mismatch"
  | "size_mismatch"
  | "low_fit"
  | "no_job_signal"
  | "no_email";

export interface VerifiedLead {
  candidate: Candidate;
  fit: number;
  email: string;
  emailStatus: string | null;
  why?: string;
  whySource?: "TEMPLATE" | "AI";
}

export interface BatchResult {
  batchNo: number;
  fetched: number;
  survivors: number;
  saved: number;
  charged: number;
  refunded: number;
  hasMore: boolean;
  nextPage: number;
  rejections: Partial<Record<RejectReason, number>>;
  note: string;
}
