import type { Lead, LeadSearch } from "@prisma/client";
import type { CreditBalance } from "./credits";

/**
 * The vendor boundary for anything leaving the server. Every field is listed by
 * hand: spreading a Prisma row ships the stored raw provider payload to a
 * browser, and the provider's person id leaks as a FIELD NAME, which a search
 * for string literals would never catch.
 */

/** Columns the API may read. Anything absent here cannot reach a response. */
export const LEAD_SELECT = {
  id: true,
  name: true,
  title: true,
  company: true,
  industry: true,
  employees: true,
  location: true,
  email: true,
  emailStatus: true,
  linkedinUrl: true,
  leadScore: true,
  priorityLevel: true,
  reasoning: true,
  whySource: true,
  scorePros: true,
  scoreCons: true,
  createdAt: true,
} as const;

export interface LeadDTO {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string | null;
  employees: number | null;
  location: string | null;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  score: number;
  priority: string;
  why: string | null;
  whySource: string;
  pros: string[];
  cons: string[];
  createdAt: string;
}

type LeadRow = Pick<Lead, keyof typeof LEAD_SELECT & keyof Lead>;

export function toLeadDTO(lead: LeadRow): LeadDTO {
  return {
    id: lead.id,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry,
    employees: lead.employees,
    location: lead.location,
    email: lead.email,
    emailStatus: lead.emailStatus,
    linkedinUrl: lead.linkedinUrl,
    score: lead.leadScore,
    priority: lead.priorityLevel,
    why: lead.reasoning,
    whySource: lead.whySource,
    pros: lead.scorePros,
    cons: lead.scoreCons,
    createdAt: lead.createdAt.toISOString(),
  };
}

export interface SearchDTO {
  id: string;
  status: string;
  prompt: string;
  note: string | null;
  delivered: number;
  requested: number;
  batchesDone: number;
  hasMore: boolean;
  /** RUNNING with nothing in flight, the UI should offer a retry, not a dead button. */
  stale: boolean;
  createdAt: string;
}

export interface CreditsDTO {
  planName: string;
  limit: number;
  used: number;
  remaining: number;
  pending: number;
  periodEnd: string;
}

export function toCreditsDTO(credits: CreditBalance): CreditsDTO {
  return {
    planName: credits.planName,
    limit: credits.limit,
    used: credits.used,
    remaining: credits.remaining,
    pending: credits.pending,
    periodEnd: credits.periodEnd.toISOString(),
  };
}

const STALE_AFTER_MS = 5 * 60_000;

export function isStaleRunning(
  search: { status: string; updatedAt: Date },
  heldHolds: number
): boolean {
  if (search.status !== "RUNNING") return false;
  if (heldHolds > 0) return false;
  return Date.now() - search.updatedAt.getTime() > STALE_AFTER_MS;
}

export function toSearchDTO(
  search: Pick<
    LeadSearch,
    "id" | "status" | "prompt" | "statusNote" | "leadsReturned" | "batchesDone" | "createdAt" | "updatedAt"
  >,
  requested: number,
  heldHolds: number
): SearchDTO {
  const delivered = search.leadsReturned;
  return {
    id: search.id,
    status: search.status,
    prompt: search.prompt,
    note: search.statusNote,
    delivered,
    requested,
    batchesDone: search.batchesDone,
    hasMore: search.status === "COMPLETE" && delivered < requested,
    stale: isStaleRunning(search, heldHolds),
    createdAt: search.createdAt.toISOString(),
  };
}
