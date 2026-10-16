/**
 * Apollo People Search has no native "open to work" / job-seeker filter.
 * The only honest pre-enrich signal is wording people write in title/headline
 * (e.g. "#OpenToWork", "seeking opportunities").
 */

export const OPEN_TO_WORK_TITLE_SIGNALS = [
  "open to work",
  "#opentowork",
  "opentowork",
  "open for work",
  "seeking opportunities",
  "seeking new opportunities",
  "seeking new",
  "seeking a new",
  "open to opportunities",
  "looking for opportunities",
  "looking for a new role",
  "looking for a new",
  "looking for work",
  "looking for new",
  "between roles",
  "between jobs",
  "career break",
  "actively looking",
  "actively seeking",
  "available for hire",
  "available immediately",
  "immediate joiner",
  "notice period",
] as const;

export const OPEN_TO_WORK_APOLLO_DISCLAIMER =
  "\"Open to work\" isn't a provider filter, we only keep people who wrote job seeking wording in their title or headline, then unlock email for those.";

export const OPEN_TO_WORK_NONE_FOUND =
  "No one in this search pool wrote open to work or job seeking wording in their title or headline. Try a tighter role + location, or use LinkedIn Recruiter for LinkedIn's real Open to Work flag.";

/** Bias Apollo text search toward profiles that mention job-seeking (still not a real OTW flag). */
export const OPEN_TO_WORK_APOLLO_KEYWORDS = "open to work";

export type OpenToWorkPerson = {
  title?: string | null;
  headline?: string | null;
};

export function openToWorkText(person: OpenToWorkPerson): string {
  return `${person.title ?? ""} ${person.headline ?? ""}`.toLowerCase();
}

export function hasOpenToWorkTitleSignal(
  titleOrPerson: string | null | undefined | OpenToWorkPerson
): boolean {
  const text =
    typeof titleOrPerson === "object" && titleOrPerson !== null
      ? openToWorkText(titleOrPerson)
      : (titleOrPerson || "").toLowerCase();
  if (!text.trim()) return false;
  return OPEN_TO_WORK_TITLE_SIGNALS.some((signal) => text.includes(signal));
}

export type FilterOpenToWorkResult<T> = {
  people: T[];
  usedTitleSignals: boolean;
  signalCount: number;
  scanned: number;
  note: string;
};

/**
 * @param strict When true (OTW searches), never keep people without signals.
 *   Soft mode (legacy): if nobody signals, keep the whole batch + disclaimer.
 */
export function filterPeopleForOpenToWork<T extends OpenToWorkPerson>(
  people: T[],
  options?: { strict?: boolean }
): FilterOpenToWorkResult<T> {
  const strict = options?.strict === true;
  const withSignal = people.filter((p) => hasOpenToWorkTitleSignal(p));

  if (withSignal.length > 0) {
    return {
      people: withSignal,
      usedTitleSignals: true,
      signalCount: withSignal.length,
      scanned: people.length,
      note: `Open to work scan: kept ${withSignal.length.toLocaleString()} / ${people.length.toLocaleString()} with job seeking wording in title/headline.`,
    };
  }

  if (strict) {
    return {
      people: [],
      usedTitleSignals: false,
      signalCount: 0,
      scanned: people.length,
      note: `Open to work scan: 0 / ${people.length.toLocaleString()} job seekers who said so themselves in this batch, checking more pages…`,
    };
  }

  return {
    people,
    usedTitleSignals: false,
    signalCount: 0,
    scanned: people.length,
    note: OPEN_TO_WORK_APOLLO_DISCLAIMER,
  };
}
