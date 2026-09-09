import { resolveEnvKey } from "@/lib/env";
import { hasOpenToWorkTitleSignal } from "@/lib/open-to-work";

/** Apify call timeout in ms — prevents hanging if actor is slow */
const APIFY_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CandidateLead {
  name: string;
  title: string;
  location: string;
  linkedinUrl?: string;
  isOpenToWork: boolean;
  /** How OTW was detected: 'title' = headline keyword, 'apify' = actor confirmed, 'both' = both signals */
  otwSignal?: "title" | "apify" | "both";
  openToWorkTitles?: string[];
  checkedAt: string;
}

export interface OpenToWorkSearchParams {
  role: string;
  location?: string;
  count?: number;
  skipApify?: boolean;
}

// ─────────────────────────────────────────────
// Apify: check one LinkedIn URL
// ─────────────────────────────────────────────

async function checkLinkedInWithApify(
  url: string,
  token: string,
  actorId: string
): Promise<boolean> {
  // Replace all "/" with "~" (actor ID format required by Apify)
  const formattedActorId = actorId.replaceAll("/", "~");
  const endpoint = `https://api.apify.com/v2/acts/${formattedActorId}/run-sync-get-dataset-items?token=${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedin_url: url.trim() }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 403 = LinkedIn blocked the scraper (expected) — skip silently
      // Other codes = log as warning
      if (response.status !== 403) {
        console.warn(`[Apify] Unexpected ${response.status} for: ${url}`);
      }
      return false;
    }

    const items = (await response.json()) as any[];
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      if (first.data?.open_to_work !== undefined) {
        return Boolean(first.data.open_to_work);
      }
      if (first.open_to_work !== undefined) {
        return Boolean(first.open_to_work);
      }
    }
    return false;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`[Apify] Timeout (${APIFY_TIMEOUT_MS}ms) for: ${url}`);
    } else {
      console.error(`[Apify Error] ${url}:`, err);
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
// Apify: batch verify multiple URLs (5 at a time)
// ─────────────────────────────────────────────

export async function verifyOpenToWorkWithApify(
  profileUrls: string[]
): Promise<Map<string, boolean>> {
  const apifyToken = process.env.APIFY_API_TOKEN ?? "";
  const actorId =
    process.env.APIFY_OPEN_TO_WORK_ACTOR ??
    "bestscrapers/linkedin-open-to-work-status";

  const statusMap = new Map<string, boolean>();

  if (!apifyToken || apifyToken === "your_apify_token_here") {
    profileUrls.forEach((url) => statusMap.set(url, false));
    return statusMap;
  }

  const batchSize = 5;
  for (let i = 0; i < profileUrls.length; i += batchSize) {
    const batch = profileUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url) => ({
        url,
        isOpen: await checkLinkedInWithApify(url, apifyToken, actorId),
      }))
    );
    results.forEach(({ url, isOpen }) => statusMap.set(url, isOpen));
  }

  return statusMap;
}

// ─────────────────────────────────────────────
// Main: Apollo search → Apify verify
// ─────────────────────────────────────────────

export async function searchAndVerifyOpenToWorkCandidates(
  params: OpenToWorkSearchParams
): Promise<CandidateLead[]> {
  const targetCount = Math.min(Math.max(params.count || 10, 1), 1000);
  const role = params.role || "Software Engineer";
  const location = params.location || "United States";
  const apolloApiKey = resolveEnvKey("APOLLO_API_KEY");

  type RawProfile = {
    apolloId: string;
    name: string;
    title: string;
    location: string;
    linkedinUrl?: string;
    titleSignal: boolean;
  };

  let rawProfiles: RawProfile[] = [];

  if (apolloApiKey) {
    try {
      const collectedIds = new Set<string>();
      const searchPeople: any[] = [];

      // Step 1a — Paginated search for candidates who mention "open to work"
      let otwPage = 1;
      const maxOtwPages = Math.min(Math.ceil(targetCount / 100), 10);
      while (searchPeople.length < targetCount && otwPage <= maxOtwPages) {
        const perPage = Math.min(targetCount - searchPeople.length, 100);
        try {
          const otwUrl =
            `https://api.apollo.io/api/v1/mixed_people/api_search` +
            `?person_titles[]=${encodeURIComponent(role)}` +
            `&person_locations[]=${encodeURIComponent(location)}` +
            `&q_keywords=open%20to%20work` +
            `&page=${otwPage}&per_page=${perPage}`;

          const res = await fetch(otwUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": apolloApiKey,
            },
          });

          if (res.ok) {
            const data = await res.json();
            const people = data.people ?? [];
            if (people.length === 0) break;

            let addedInThisPage = 0;
            for (const p of people) {
              if (p.id && !collectedIds.has(p.id)) {
                collectedIds.add(p.id);
                searchPeople.push(p);
                addedInThisPage++;
              }
            }
            if (addedInThisPage === 0) break;
          } else {
            console.warn(`[Apollo OTW search page ${otwPage}]:`, res.status);
            break;
          }
        } catch (e) {
          console.warn(`[Apollo OTW search page ${otwPage} error]:`, e);
          break;
        }
        otwPage++;
      }

      // Step 1b — Top up with general role search across pages if we still need more
      let genPage = 1;
      const maxGenPages = Math.min(
        Math.ceil((targetCount - searchPeople.length) / 100),
        10
      );
      while (searchPeople.length < targetCount && genPage <= maxGenPages) {
        const perPage = Math.min(targetCount - searchPeople.length, 100);
        try {
          const genUrl =
            `https://api.apollo.io/api/v1/mixed_people/api_search` +
            `?person_titles[]=${encodeURIComponent(role)}` +
            `&person_locations[]=${encodeURIComponent(location)}` +
            `&page=${genPage}&per_page=${perPage}`;

          const res = await fetch(genUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": apolloApiKey,
            },
          });

          if (res.ok) {
            const data = await res.json();
            const people = data.people ?? [];
            if (people.length === 0) break;

            let addedInThisPage = 0;
            for (const p of people) {
              if (p.id && !collectedIds.has(p.id)) {
                collectedIds.add(p.id);
                searchPeople.push(p);
                addedInThisPage++;
              }
            }
            if (addedInThisPage === 0) break;
          } else {
            console.warn(`[Apollo general search page ${genPage}]:`, res.status);
            break;
          }
        } catch (e) {
          console.warn(`[Apollo general search page ${genPage} error]:`, e);
          break;
        }
        genPage++;
      }

      // Build the result from the free search response first. Enrichment below
      // is deliberately limited to LinkedIn URLs; email, phone, and company
      // data are never requested or returned by this feature.
      rawProfiles = searchPeople.map((person) => ({
        apolloId: person.id as string,
        name:
          person.name ||
          `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() ||
          "Candidate",
        title: person.title || role,
        location:
          [person.city, person.state, person.country].filter(Boolean).join(", ") ||
          location,
        linkedinUrl:
          typeof person.linkedin_url === "string" &&
          person.linkedin_url.includes("linkedin.com/in/")
            ? person.linkedin_url
            : undefined,
        titleSignal: hasOpenToWorkTitleSignal({
          title: person.title,
          headline: person.headline,
        }),
      }));

      // Apollo search is free, but LinkedIn URLs may require bulk_match.
      // Request only profile matching with personal emails and phone numbers
      // explicitly disabled. This is the only Apollo credit-consuming step.
      const BATCH_SIZE = 10;
      const CONCURRENCY = 5;
      const linkedinByApolloId = new Map<string, string>();
      const batches: RawProfile[][] = [];
      for (let i = 0; i < rawProfiles.length; i += BATCH_SIZE) {
        batches.push(rawProfiles.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const chunk = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map(async (batch) => {
            try {
              const response = await fetch(
                "https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": apolloApiKey,
                  },
                  body: JSON.stringify({
                    details: batch.map((profile) => ({ id: profile.apolloId })),
                  }),
                }
              );

              if (!response.ok) {
                console.warn("[Apollo LinkedIn enrichment]:", response.status);
                return [];
              }

              const data = await response.json();
              return (data.matches ?? []) as any[];
            } catch (error) {
              console.warn("[Apollo LinkedIn enrichment error]:", error);
              return [];
            }
          })
        );

        for (const matches of results) {
          for (const match of matches) {
            if (
              typeof match?.id === "string" &&
              typeof match?.linkedin_url === "string" &&
              match.linkedin_url.includes("linkedin.com/in/")
            ) {
              linkedinByApolloId.set(match.id, match.linkedin_url);
            }
          }
        }
      }

      rawProfiles = rawProfiles.map((profile) => ({
        ...profile,
        linkedinUrl:
          linkedinByApolloId.get(profile.apolloId) ?? profile.linkedinUrl,
      }));
      console.log(
        `[OpenToWork] Prepared ${rawProfiles.length} candidates; resolved ${linkedinByApolloId.size} LinkedIn URLs`
      );
    } catch (e) {
      console.warn("[Apollo search error]:", e);
    }
  }

  // Step 3 — Apify verification
  // For small batches (<=25) and when skipApify is not set, run Apify verification.
  // For bulk searches (>25), skip Apify to prevent timeouts and rely on title signals.
  const urls = rawProfiles
    .map((p) => p.linkedinUrl)
    .filter((url): url is string => Boolean(url));
  const shouldRunApify = !params.skipApify && urls.length <= 25;

  let apifyMap = new Map<string, boolean>();
  if (shouldRunApify && urls.length > 0) {
    apifyMap = await verifyOpenToWorkWithApify(urls);
  } else if (urls.length > 25) {
    console.log(
      `[OpenToWork] Bulk mode: processing ${urls.length} candidates using verified title/headline signals (Apify skipped for performance)`
    );
  }

  const candidates: CandidateLead[] = rawProfiles.map((profile) => {
    const apifyOtw = profile.linkedinUrl
      ? apifyMap.get(profile.linkedinUrl) ?? false
      : false;
    const titleOtw = profile.titleSignal;
    const isOpenToWork = titleOtw || apifyOtw;

    let otwSignal: CandidateLead["otwSignal"] | undefined;
    if (titleOtw && apifyOtw) otwSignal = "both";
    else if (titleOtw) otwSignal = "title";
    else if (apifyOtw) otwSignal = "apify";

    const { apolloId: _apolloId, titleSignal: _unused, ...clean } = profile;

    return {
      ...clean,
      isOpenToWork,
      otwSignal,
      openToWorkTitles: [role],
      checkedAt: new Date().toISOString(),
    } as CandidateLead;
  });

  // OTW candidates come first
  candidates.sort((a, b) => Number(b.isOpenToWork) - Number(a.isOpenToWork));

  return candidates;
}

// ─────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────

export function convertCandidatesToCsv(candidates: CandidateLead[]): string {
  const headers = [
    "Candidate Name",
    "Job Title",
    "Location",
    "LinkedIn Profile URL",
    "Open To Work",
    "Detection Method",
    "Checked Date",
  ];

  const esc = (val: string | undefined | null) => {
    if (!val) return '""';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const signalLabel = (c: CandidateLead) => {
    if (!c.isOpenToWork) return "No";
    if (c.otwSignal === "both") return "Title Signal + Apify";
    if (c.otwSignal === "apify") return "Apify Confirmed";
    return "Title/Headline Signal";
  };

  const rows = candidates.map((c) => [
    esc(c.name),
    esc(c.title),
    esc(c.location),
    esc(c.linkedinUrl),
    esc(c.isOpenToWork ? "YES" : "NO"),
    esc(signalLabel(c)),
    esc(c.checkedAt.split("T")[0]),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
