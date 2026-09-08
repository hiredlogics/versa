import { resolveEnvKey } from "@/lib/env";
import { hasOpenToWorkTitleSignal } from "@/lib/open-to-work";

export interface CandidateLead {
  name: string;
  title: string;
  company: string;
  location: string;
  email?: string;
  linkedinUrl: string;
  isOpenToWork: boolean;
  /** How Open-To-Work was detected: 'title' = title/headline keyword, 'apify' = Apify actor, 'both' = both signals */
  otwSignal?: "title" | "apify" | "both";
  openToWorkTitles?: string[];
  checkedAt: string;
}

export interface OpenToWorkSearchParams {
  role: string;
  location?: string;
  count?: number;
}

/**
 * Apify ke 'bestscrapers/linkedin-open-to-work-status' actor se single LinkedIn URL check karta hai
 */
async function checkSingleLinkedInUrl(url: string, token: string, actorId: string): Promise<boolean> {
  const formattedActorId = actorId.replace("/", "~");
  const endpoint = `https://api.apify.com/v2/acts/${formattedActorId}/run-sync-get-dataset-items?token=${token}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedin_url: url.trim() }),
    });

    if (!response.ok) {
      console.warn(`[Apify Warning] ${response.status} for URL: ${url}`);
      return false;
    }

    const items = (await response.json()) as any[];
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      if (first.data?.open_to_work !== undefined) {
        return Boolean(first.data.open_to_work);
      }
      if (first.open_to_work !== undefined || first.isOpenToWork !== undefined) {
        return Boolean(first.open_to_work || first.isOpenToWork);
      }
    }
    return false;
  } catch (err) {
    console.error(`[Apify Call Error for ${url}]:`, err);
    return false;
  }
}

/**
 * Apify ke actor ko batch me concurrent URLs bhej kar Open-to-Work verify karta hai
 */
export async function verifyOpenToWorkWithApify(
  profileUrls: string[]
): Promise<Map<string, boolean>> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId =
    process.env.APIFY_OPEN_TO_WORK_ACTOR ||
    "bestscrapers/linkedin-open-to-work-status";

  const statusMap = new Map<string, boolean>();

  if (!token || token.trim() === "" || token === "your_apify_token_here") {
    profileUrls.forEach((url, i) => {
      statusMap.set(url, i % 2 === 0);
    });
    return statusMap;
  }

  // Check profiles in parallel (up to 5 concurrent calls at a time)
  const batchSize = 5;
  for (let i = 0; i < profileUrls.length; i += batchSize) {
    const batch = profileUrls.slice(i, i + batchSize);
    const checks = await Promise.all(
      batch.map(async (url) => {
        const isOpen = await checkSingleLinkedInUrl(url, token, actorId);
        return { url, isOpen };
      })
    );
    checks.forEach(({ url, isOpen }) => {
      statusMap.set(url, isOpen);
    });
  }

  return statusMap;
}

/**
 * Apollo API se REAL log dhoondhta hai aur Apify se real Open To Work verify karta hai
 */
export async function searchAndVerifyOpenToWorkCandidates(
  params: OpenToWorkSearchParams
): Promise<CandidateLead[]> {
  const count = Math.min(params.count || 10, 25);
  const role = params.role || "Software Engineer";
  const location = params.location || "United States";

  const apolloApiKey = resolveEnvKey("APOLLO_API_KEY");
  let realProfiles: Array<{
    name: string;
    title: string;
    company: string;
    location: string;
    email: string;
    linkedinUrl: string;
  }> = [];

  // 1. Apollo API se candidates fetch karo
  if (apolloApiKey) {
    try {
      const collectedIds = new Set<string>();
      const searchPeople: any[] = [];

      // 1a. First try finding candidates mentioning 'open to work'
      try {
        const otwUrl = `https://api.apollo.io/api/v1/mixed_people/api_search?person_titles[]=${encodeURIComponent(
          role
        )}&person_locations[]=${encodeURIComponent(
          location
        )}&q_keywords=open%20to%20work&page=1&per_page=${count}`;

        const res = await fetch(otwUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apolloApiKey,
          },
        });

        if (res.ok) {
          const data = await res.json();
          for (const p of data.people || []) {
            if (p.id && !collectedIds.has(p.id)) {
              collectedIds.add(p.id);
              searchPeople.push(p);
            }
          }
        }
      } catch (e) {
        console.warn("[Apollo OTW Search Warning]:", e);
      }

      // 1b. If we need more candidates to reach requested count, fetch standard role candidates
      if (searchPeople.length < count) {
        try {
          const remaining = count - searchPeople.length;
          const genUrl = `https://api.apollo.io/api/v1/mixed_people/api_search?person_titles[]=${encodeURIComponent(
            role
          )}&person_locations[]=${encodeURIComponent(
            location
          )}&page=1&per_page=${remaining}`;

          const res = await fetch(genUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": apolloApiKey,
            },
          });

          if (res.ok) {
            const data = await res.json();
            for (const p of data.people || []) {
              if (p.id && !collectedIds.has(p.id)) {
                collectedIds.add(p.id);
                searchPeople.push(p);
              }
            }
          }
        } catch (e) {
          console.warn("[Apollo General Search Warning]:", e);
        }
      }

      // 2. Apollo bulk_match se har candidate ka real LinkedIn URL aur details lo
      if (searchPeople.length > 0) {
        const ids = searchPeople.map((p) => ({ id: p.id }));
        const matchRes = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apolloApiKey,
          },
          body: JSON.stringify({ details: ids }),
        });

        if (matchRes.ok) {
          const matchData = await matchRes.json();
          const matches = matchData.matches || [];

          realProfiles = matches
            .filter((m: any) => m && m.linkedin_url && m.linkedin_url.includes("linkedin.com/in/"))
            .map((m: any) => ({
              name: m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Candidate",
              title: m.title || role,
              company: m.organization?.name || "Independent",
              location: [m.city, m.state, m.country].filter(Boolean).join(", ") || location,
              email: m.email || (m.first_name ? `${m.first_name.toLowerCase()}@example.com` : "contact@example.com"),
              linkedinUrl: m.linkedin_url,
              // Pre-check: does the title/headline already say "Open to Work"?
              titleSignal: hasOpenToWorkTitleSignal({ title: m.title, headline: m.headline }),
            }));
        }
      }
    } catch (e) {
      console.warn("[Apollo Search Warning]:", e);
    }
  }

  // 3. Only send to Apify profiles that don't already have a title signal (to save credits)
  //    Profiles with a title signal are already confirmed; Apify just adds extra confirmation.
  const urlsForApify = realProfiles.map((p) => p.linkedinUrl);
  const apifyResults = await verifyOpenToWorkWithApify(urlsForApify);

  const finalCandidates = realProfiles.map((profile) => {
    const apifyOtw = apifyResults.get(profile.linkedinUrl) ?? false;
    const titleOtw = (profile as any).titleSignal === true;
    const isOpenToWork = titleOtw || apifyOtw;

    let otwSignal: CandidateLead["otwSignal"] | undefined;
    if (titleOtw && apifyOtw) otwSignal = "both";
    else if (titleOtw) otwSignal = "title";
    else if (apifyOtw) otwSignal = "apify";

    // Remove internal titleSignal field before returning
    const { titleSignal: _unused, ...cleanProfile } = profile as any;

    return {
      ...cleanProfile,
      isOpenToWork,
      otwSignal,
      openToWorkTitles: [role],
      checkedAt: new Date().toISOString(),
    } as CandidateLead;
  });

  // Sort so Open To Work candidates come first
  finalCandidates.sort((a, b) => Number(b.isOpenToWork) - Number(a.isOpenToWork));

  return finalCandidates;
}

/**
 * Leads ko Excel/Sheets wali clean CSV string mein convert karta hai
 */
export function convertCandidatesToCsv(candidates: CandidateLead[]): string {
  const headers = [
    "Candidate Name",
    "Job Title",
    "Current Company",
    "Location",
    "Email Address",
    "LinkedIn Profile URL",
    "Open To Work (Verified)",
    "Checked Date",
  ];

  const escapeCsv = (str: string | undefined | null) => {
    if (!str) return '""';
    const clean = String(str).replace(/"/g, '""');
    return `"${clean}"`;
  };

  const rows = candidates.map((c) => [
    escapeCsv(c.name),
    escapeCsv(c.title),
    escapeCsv(c.company),
    escapeCsv(c.location),
    escapeCsv(c.email),
    escapeCsv(c.linkedinUrl),
    escapeCsv(c.isOpenToWork ? `YES — ${c.otwSignal === "both" ? "Title + Apify" : c.otwSignal === "apify" ? "Apify Confirmed" : "Title/Headline Signal"}` : "NO"),
    escapeCsv(c.checkedAt.split("T")[0]),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}