import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

export type OpenToWorkLevel = "likely" | "maybe" | "unlikely";

export interface OpenToWorkEmploymentEntry {
  title?: string | null;
  organization_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  current?: boolean | null;
}

export interface OpenToWorkScoreInput {
  title?: string | null;
  headline?: string | null;
  company?: string | null;
  employmentHistory?: OpenToWorkEmploymentEntry[] | null;
  githubUrl?: string | null;
  githubUsername?: string | null;
  rawApolloData?: unknown;
  /** Optionally pass pre-computed GitHub recent public events count */
  githubRecentEvents?: number | null;
  /** Optionally supply a custom layoffs list for testing */
  layoffsData?: LayoffRecord[] | null;
  /** Custom reference date for time-based tests */
  now?: Date;
}

export interface OpenToWorkScoreResult {
  level: OpenToWorkLevel;
  points: number;
  reasons: string[];
}

export interface LayoffRecord {
  company: string;
  date: string;
  source?: string;
}

export const OPEN_TO_WORK_PHRASES = [
  "open to work",
  "#opentowork",
  "opentowork",
  "open for opportunities",
  "open for work",
  "seeking opportunities",
  "seeking new opportunities",
  "seeking a new role",
  "seeking new",
  "seeking a new",
  "seeking",
  "looking for opportunities",
  "looking for a new role",
  "looking for work",
  "looking for new",
  "looking for",
  "actively looking",
  "actively seeking",
  "available for hire",
  "available for opportunities",
  "available for",
  "available immediately",
  "immediate joiner",
  "in transition",
  "between roles",
  "between jobs",
  "career break",
  "open to new opportunities",
  "exploring new opportunities",
  "freelance",
  "consultant",
  "fractional",
] as const;

const COMPANY_SUFFIX_REGEX =
  /\b(inc|incorporated|llc|corp|corporation|ltd|limited|co|company|technologies|technology|tech|labs|lab|group|solutions|software|systems|io|ai|com)\b/gi;

/**
 * Normalizes company name for fuzzy matching against layoffs list.
 */
export function normalizeCompanyName(name?: string | null): string {
  if (!name) return "";
  let clean = name.toLowerCase();
  clean = clean.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, " ");
  clean = clean.replace(COMPANY_SUFFIX_REGEX, " ");
  return clean.replace(/\s+/g, " ").trim();
}

/**
 * Extracts a GitHub username from a full profile URL or raw username.
 */
export function extractGithubUsername(urlOrUsername?: string | null): string | null {
  if (!urlOrUsername) return null;
  const trimmed = urlOrUsername.trim().replace(/^@/, "");
  if (!trimmed) return null;
  const match = trimmed.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  if (match) return match[1].toLowerCase();
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

let cachedLayoffs: LayoffRecord[] | null = null;

export function loadLayoffsData(): LayoffRecord[] {
  if (cachedLayoffs) return cachedLayoffs;
  try {
    const filePath = path.resolve(process.cwd(), "data", "layoffs.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedLayoffs = parsed;
        return parsed;
      }
    }
  } catch {
    // Return empty list on failure
  }
  cachedLayoffs = [];
  return cachedLayoffs;
}

export function resetLayoffsCache() {
  cachedLayoffs = null;
}

/**
 * Checks if a company had layoffs in the past 12 months.
 */
export function hadRecentLayoff(
  company: string | null | undefined,
  layoffs: LayoffRecord[],
  now: Date = new Date()
): boolean {
  const normalized = normalizeCompanyName(company);
  if (!normalized) return false;

  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  return layoffs.some((entry) => {
    if (!entry.company) return false;
    const entryNorm = normalizeCompanyName(entry.company);
    if (!entryNorm) return false;

    // Exact normalized match or token containment
    const isMatch =
      normalized === entryNorm ||
      (normalized.length >= 3 && entryNorm.includes(normalized)) ||
      (entryNorm.length >= 3 && normalized.includes(entryNorm));

    if (!isMatch) return false;

    if (entry.date) {
      const layoffDate = new Date(entry.date);
      if (!isNaN(layoffDate.getTime()) && layoffDate < twelveMonthsAgo) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Fetches public GitHub events for a user, using 7-day database cache and 3s timeout.
 */
export async function getGithubRecentEvents(
  username: string,
  now: Date = new Date()
): Promise<number> {
  const cleanUser = username.trim().toLowerCase();
  if (!cleanUser) return 0;

  // 1. Check database cache (valid for 7 days)
  try {
    const cached = await prisma.githubActivityCache.findUnique({
      where: { username: cleanUser },
    });

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (cached && cached.checkedAt >= sevenDaysAgo) {
      return cached.recentEvents;
    }
  } catch {
    // If DB read fails, continue to network fetch
  }

  // 2. Fetch public events from GitHub API
  let recentEvents = 0;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Versa-App",
      Accept: "application/vnd.github.v3+json",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanUser)}/events/public`, {
      headers,
      signal: controller.signal,
    });

    if (res.ok) {
      const events = (await res.json()) as Array<{ created_at?: string }>;
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (Array.isArray(events)) {
        for (const ev of events) {
          if (ev.created_at) {
            const evDate = new Date(ev.created_at);
            if (!isNaN(evDate.getTime()) && evDate >= thirtyDaysAgo) {
              recentEvents += 1;
            }
          }
        }
      }

      // Upsert into cache
      try {
        await prisma.githubActivityCache.upsert({
          where: { username: cleanUser },
          create: { username: cleanUser, recentEvents, checkedAt: now },
          update: { recentEvents, checkedAt: now },
        });
      } catch {
        // Cache write failure is non-fatal
      }
    }
  } catch {
    // Timeout or network error returns 0 gracefully
  } finally {
    clearTimeout(timeoutId);
  }

  return recentEvents;
}

/**
 * Calculates likely open-to-work score and reasons for a lead.
 */
export async function scoreOpenToWork(input: OpenToWorkScoreInput): Promise<OpenToWorkScoreResult> {
  const now = input.now ?? new Date();
  let points = 0;
  const reasons: string[] = [];

  // 1. Headline / Title availability wording (+3 points)
  const text = `${input.headline || ""} ${input.title || ""}`.toLowerCase();
  const hasHeadlineSignal = OPEN_TO_WORK_PHRASES.some((phrase) => text.includes(phrase));
  if (hasHeadlineSignal) {
    points += 3;
    reasons.push("Public headline indicates availability");
  }

  // 2. Tenure signal
  const raw = input.rawApolloData as { employment_history?: OpenToWorkEmploymentEntry[] } | undefined;
  const history: OpenToWorkEmploymentEntry[] =
    input.employmentHistory || raw?.employment_history || [];

  if (history.length > 0) {
    // Look at most recent position
    const mostRecent = history[0];
    const isEnded =
      mostRecent.current === false ||
      (Boolean(mostRecent.end_date) && new Date(mostRecent.end_date!) <= now);

    if (isEnded) {
      points += 2;
      reasons.push("Most recent position ended");
    } else if (mostRecent.start_date) {
      const startDate = new Date(mostRecent.start_date);
      if (!isNaN(startDate.getTime())) {
        const tenureMonths =
          (now.getFullYear() - startDate.getFullYear()) * 12 +
          (now.getMonth() - startDate.getMonth());

        if (tenureMonths > 24) {
          points += 1;
          reasons.push("In current role for over 2 years");
        } else if (tenureMonths >= 0 && tenureMonths < 6) {
          points -= 1;
          reasons.push("Recently started a new position (< 6 months)");
        }
      }
    }
  }

  // 3. Layoffs signal (+2 points)
  const layoffs = input.layoffsData ?? loadLayoffsData();
  const employer = input.company || history[0]?.organization_name;
  if (hadRecentLayoff(employer, layoffs, now)) {
    points += 2;
    reasons.push("Employer had public layoffs in the past 12 months");
  }

  // 4. GitHub activity signal (+1 point)
  let ghEvents = input.githubRecentEvents;
  if (ghEvents === undefined || ghEvents === null) {
    const rawApollo = input.rawApolloData as { github_url?: string } | undefined;
    const ghUser =
      extractGithubUsername(input.githubUsername) ||
      extractGithubUsername(input.githubUrl) ||
      extractGithubUsername(rawApollo?.github_url);

    if (ghUser) {
      ghEvents = await getGithubRecentEvents(ghUser, now);
    }
  }

  if (ghEvents && ghEvents >= 5) {
    points += 1;
    reasons.push("Active public GitHub contributions in last 30 days");
  }

  // Level determination:
  // points >= 3: likely
  // points >= 1: maybe
  // points <= 0: unlikely
  let level: OpenToWorkLevel = "unlikely";
  if (points >= 3) {
    level = "likely";
  } else if (points >= 1) {
    level = "maybe";
  }

  return {
    level,
    points,
    reasons,
  };
}
