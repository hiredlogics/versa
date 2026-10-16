import { LEAD_BATCH_SIZE } from "@/lib/apollo-config";
import type { ApolloSearchFilters } from "@/lib/types";

export type ApolloFetchProgress = {
  lastPage: number;
  totalPages: number;
  partial: boolean;
  canResume: boolean;
  peoplePulled: number;
  savedCount?: number;
  /** Sequential process batches completed (each ~LEAD_BATCH_SIZE). */
  batchesCompleted?: number;
  /** Raw Apollo people fetched across completed batches. */
  leadsFetched?: number;
  /** Leads saved with usable email so far. */
  leadsWithEmail?: number;
  emailsUnlockedCount?: number;
  totalToUnlock?: number;
};

export type StoredApolloFilters = ApolloSearchFilters & {
  _progress?: ApolloFetchProgress;
};

export function stripFetchProgress(
  filters: StoredApolloFilters | ApolloSearchFilters | null | undefined
): ApolloSearchFilters | null {
  if (!filters) return null;
  const { _progress: _, ...rest } = filters as StoredApolloFilters;
  return rest as ApolloSearchFilters;
}

export function readFetchProgress(raw: unknown): ApolloFetchProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const progress = (raw as StoredApolloFilters)._progress;
  if (!progress || typeof progress.lastPage !== "number") return null;
  return progress;
}

export function withFetchProgress(
  filters: ApolloSearchFilters | StoredApolloFilters | null | undefined,
  progress: ApolloFetchProgress
): StoredApolloFilters {
  const base = stripFetchProgress(filters) ?? {
    personTitles: [],
    personLocations: [],
    includeSimilarTitles: true,
  };
  return { ...base, _progress: progress };
}

export function canResumeSearch(
  rawApolloFilters: unknown,
  leadsReturned: number,
  totalAvailable?: number | null,
  relaxNote?: string | null
): boolean {
  if (leadsReturned >= 50_000) return false;

  const progress = readFetchProgress(rawApolloFilters);
  if (progress) {
    if (!progress.canResume) return false;
    if (progress.lastPage >= progress.totalPages && progress.totalPages > 0) return false;
    return true;
  }

  // Legacy partial runs (before _progress was stored)
  if (relaxNote && /time limit|Stopped early|page\(s\)|batch/i.test(relaxNote) && leadsReturned > 0) {
    const cap = Math.min(50_000, totalAvailable && totalAvailable > 0 ? totalAvailable : 50_000);
    return leadsReturned < cap;
  }

  return false;
}

/** Estimate next Apollo page when _progress is missing (100 results per page). */
export function estimateResumePage(leadsReturned: number): number {
  return Math.max(1, Math.ceil(leadsReturned / 100) + 1);
}

/** Leads processed per sequential job batch (fetch → unlock → save). */
export function getProcessBatchSize(): number {
  return LEAD_BATCH_SIZE;
}

/**
 * One batch per explicit user action. This is not configurable on purpose: a
 * loop here can drain a whole credit balance from a single prompt.
 */
export function getMaxAutoBatches(): number {
  return 1;
}

/** Soft timeout for unlock within one batch (ms). */
/**
 * Save only provider-verified emails. Pattern-guessed ("extrapolated")
 * addresses bounce, so they are skipped unless this is turned off.
 */
export function requireVerifiedEmail(): boolean {
  const raw = (process.env.LEAD_REQUIRE_VERIFIED_EMAIL || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

/**
 * How many people one click may spend unlock credits on. Verified emails are a
 * minority of any pool, so a single batch often yields nothing, this lets a run
 * keep looking while still capping what it can spend.
 */
export function getUnlockAttemptBudget(batchSize: number): number {
  const configured = parseInt(process.env.LEAD_UNLOCK_ATTEMPTS_PER_RUN || "", 10);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return batchSize * 3;
}

export function getUnlockBatchTimeoutMs(): number {
  return Math.max(
    30_000,
    parseInt(process.env.UNLOCK_BATCH_TIMEOUT_MS || "180000", 10)
  );
}
