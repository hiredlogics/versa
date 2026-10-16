import { hasOpenToWorkTitleSignal } from "@/lib/open-to-work";

/**
 * "Likely looking" estimate from data Versa already has. Pure: no network, database or
 * file access, so callers pass in layoffs and GitHub activity.
 */

export type OpenToWorkLevel = "likely" | "maybe" | "unlikely";

export interface EmploymentEntry {
  title?: string | null;
  organization_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  current?: boolean | null;
}

export interface LayoffRecord {
  company: string;
  /** ISO date, e.g. "2026-08-14". */
  date: string;
  source?: string;
}

export interface OpenToWorkInput {
  title?: string | null;
  headline?: string | null;
  company?: string | null;
  employmentHistory?: EmploymentEntry[] | null;
  /** Public GitHub events in the last 30 days; null when unknown. */
  githubRecentEvents?: number | null;
  layoffs?: LayoffRecord[];
  now?: Date;
}

export interface OpenToWorkResult {
  level: OpenToWorkLevel;
  points: number;
  reasons: string[];
}

export const GITHUB_ACTIVE_EVENTS = 5;

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
const FREELANCE_TITLE = /\b(freelanc\w*|contract(or)?|consultant)\b/i;
const COMPANY_SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|plc|gmbh)\b/g;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inLastSixMonths(date: Date, now: Date): boolean {
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= SIX_MONTHS_MS;
}

function monthYear(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Stripe, Inc." and "stripe" match; "Acme Labs" and "Acme" do not. */
export function normalizeCompanyName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Date of the latest layoff at this company in the last 6 months, or null. */
export function findRecentLayoff(
  company: string | null | undefined,
  layoffs: LayoffRecord[],
  now: Date
): Date | null {
  const key = normalizeCompanyName(company);
  if (!key) return null;

  let latest: Date | null = null;
  for (const entry of layoffs) {
    if (normalizeCompanyName(entry.company) !== key) continue;
    const date = parseDate(entry.date);
    if (date && inLastSixMonths(date, now) && (!latest || date > latest)) latest = date;
  }
  return latest;
}

function isCurrentJob(entry: EmploymentEntry): boolean {
  return entry.current === true || (entry.current == null && !entry.end_date);
}

export function scoreOpenToWork(input: OpenToWorkInput): OpenToWorkResult {
  const now = input.now ?? new Date();
  const history = input.employmentHistory ?? [];
  const currentJob = history.find(isCurrentJob);
  let points = 0;
  const reasons: string[] = [];

  if (hasOpenToWorkTitleSignal({ title: input.title, headline: input.headline })) {
    points += 5;
    reasons.push("Says they are open to work");
  }

  if (history.length > 0 && !currentJob) {
    const lastEnded = history
      .map((entry) => parseDate(entry.end_date))
      .reduce<Date | null>((latest, date) => (date && (!latest || date > latest) ? date : latest), null);
    // A job that ended years ago is more likely old data than a recent job loss.
    if (!lastEnded || inLastSixMonths(lastEnded, now)) {
      points += 4;
      reasons.push(lastEnded ? `Last job ended ${monthYear(lastEnded)}` : "No current job listed");
    }
  }

  const company = input.company || currentJob?.organization_name;
  const layoffDate = findRecentLayoff(company, input.layoffs ?? [], now);
  if (layoffDate) {
    points += 3;
    reasons.push(`${company} had layoffs in ${monthYear(layoffDate)}`);
  }

  // Someone who just started a job is unlikely to be looking.
  const startedAt = parseDate(currentJob?.start_date);
  if (startedAt && inLastSixMonths(startedAt, now)) points -= 3;

  if (FREELANCE_TITLE.test(input.title ?? "")) {
    points += 1;
    reasons.push("Works freelance or on contract");
  }

  if ((input.githubRecentEvents ?? 0) >= GITHUB_ACTIVE_EVENTS) {
    points += 1;
    reasons.push("Active on GitHub recently");
  }

  const level: OpenToWorkLevel = points >= 5 ? "likely" : points >= 2 ? "maybe" : "unlikely";
  return { level, points, reasons };
}
