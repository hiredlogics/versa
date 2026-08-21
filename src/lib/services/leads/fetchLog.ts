/**
 * Structured fetch-path logging for lead search reliability / timing.
 * Grep: scope "lead-fetch" or event "stage_timing" / "stage_chunk".
 */

export function logLeadFetch(
  event: string,
  payload: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      scope: "lead-fetch",
      event,
      at: new Date().toISOString(),
      ...payload,
    })
  );
}

/** Simple percentile helper for in-job chunk timings (ms). */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1)
  );
  return sortedAsc[idx];
}

export function summarizeDurations(msList: number[]): {
  count: number;
  sumMs: number;
  medianMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
} {
  if (msList.length === 0) {
    return { count: 0, sumMs: 0, medianMs: null, p95Ms: null, maxMs: null };
  }
  const sorted = [...msList].sort((a, b) => a - b);
  return {
    count: sorted.length,
    sumMs: sorted.reduce((a, b) => a + b, 0),
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1],
  };
}

export function startStageTimer(): { startedAt: number; elapsedMs: () => number } {
  const startedAt = Date.now();
  return {
    startedAt,
    elapsedMs: () => Date.now() - startedAt,
  };
}

/**
 * Log a named pipeline stage (fetch | unlock | why | score) with duration + outcome.
 */
export function logStageTiming(input: {
  stage: "fetch" | "unlock" | "why" | "score" | "save" | "widen";
  searchId?: string;
  durationMs: number;
  ok: boolean;
  counts?: Record<string, number | null | undefined>;
  error?: string;
  extra?: Record<string, unknown>;
}): void {
  logLeadFetch("stage_timing", {
    stage: input.stage,
    searchId: input.searchId,
    durationMs: input.durationMs,
    ok: input.ok,
    ...(input.counts ?? {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.extra ?? {}),
  });
}
