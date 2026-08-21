/**
 * Apollo People Search has no native "open to work" / job-seeker filter.
 * The only pre-enrich signal we usually get is the current `title` string
 * (some people put "#OpenToWork" / "seeking opportunities" in their title).
 */

export const OPEN_TO_WORK_TITLE_SIGNALS = [
  "open to work",
  "#opentowork",
  "opentowork",
  "seeking opportunities",
  "seeking new opportunities",
  "open to opportunities",
  "looking for opportunities",
  "looking for a new role",
  "looking for work",
  "between roles",
  "between jobs",
  "career break",
  "actively looking",
  "available for hire",
] as const;

export const OPEN_TO_WORK_APOLLO_DISCLAIMER =
  "\"Open to work\" can't be filtered directly — results are narrowed by your other criteria (titles, location, keywords) and ranked for outreach instead.";

export function hasOpenToWorkTitleSignal(title: string | null | undefined): boolean {
  const text = (title || "").toLowerCase();
  if (!text.trim()) return false;
  return OPEN_TO_WORK_TITLE_SIGNALS.some((signal) => text.includes(signal));
}

/**
 * Hard filter when Apollo title text exposes an OTW signal.
 * When no one in the batch has a signal (common), keep the batch and return
 * `usedTitleSignals: false` so callers can surface the disclaimer and avoid
 * pretending we verified open-to-work status.
 */
export function filterPeopleForOpenToWork<T extends { title?: string | null }>(
  people: T[]
): {
  people: T[];
  usedTitleSignals: boolean;
  signalCount: number;
  note: string;
} {
  const withSignal = people.filter((p) => hasOpenToWorkTitleSignal(p.title));
  if (withSignal.length > 0) {
    return {
      people: withSignal,
      usedTitleSignals: true,
      signalCount: withSignal.length,
      note: `Pre-unlock filter: kept ${withSignal.length.toLocaleString()} / ${people.length.toLocaleString()} with open-to-work wording in their title.`,
    };
  }

  return {
    people,
    usedTitleSignals: false,
    signalCount: 0,
    note: OPEN_TO_WORK_APOLLO_DISCLAIMER,
  };
}
