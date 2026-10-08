import { prisma } from "@/lib/db/prisma";

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

/** "https://github.com/Octocat/repo" → "octocat". Null for anything that is not a profile. */
export function githubUsernameFromUrl(url: string | null | undefined): string | null {
  const match = url?.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z0-9](?:[a-z0-9-]{0,38}))(?:[/?#]|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Public events in the last 30 days, or null when GitHub could not be asked. */
async function fetchRecentEvents(username: string, now: Date): Promise<number | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "versa-app",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const res = await fetch(`https://api.github.com/users/${username}/events/public`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return 0;
    if (!res.ok) return null;

    const events = (await res.json()) as Array<{ created_at?: string }>;
    const since = now.getTime() - RECENT_MS;
    return events.filter((event) => Date.parse(event.created_at ?? "") >= since).length;
  } catch {
    return null;
  }
}

/**
 * Recent public GitHub events per username, cached for 7 days. Never throws: a username
 * GitHub could not answer for is simply left out (no signal), and never fails a search.
 */
export async function getGithubRecentEvents(
  usernames: string[],
  now = new Date()
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const unique = [...new Set(usernames)];
  if (unique.length === 0) return result;

  try {
    const cached = await prisma.githubActivityCache.findMany({
      where: { username: { in: unique }, checkedAt: { gte: new Date(now.getTime() - CACHE_MS) } },
      select: { username: true, recentEvents: true },
    });
    for (const row of cached) result.set(row.username, row.recentEvents);

    const toFetch = unique.filter((username) => !result.has(username));
    const fetched = await Promise.all(toFetch.map((username) => fetchRecentEvents(username, now)));

    await Promise.all(
      toFetch.map((username, i) => {
        const recentEvents = fetched[i];
        if (recentEvents === null) return null;
        result.set(username, recentEvents);
        return prisma.githubActivityCache.upsert({
          where: { username },
          create: { username, recentEvents, checkedAt: now },
          update: { recentEvents, checkedAt: now },
        });
      })
    );
  } catch (error) {
    console.warn("[githubActivity] skipped:", error instanceof Error ? error.message : error);
  }
  return result;
}
