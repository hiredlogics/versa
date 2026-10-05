import { LAYOFFS } from "@/lib/layoffs";
import {
  scoreOpenToWork,
  type EmploymentEntry,
  type OpenToWorkResult,
} from "@/lib/open-to-work-score";
import { getGithubRecentEvents, githubUsernameFromUrl } from "@/lib/services/leads/githubActivity";

/** GitHub is only asked about the first leads of each search, to stay fast and in rate limits. */
export const GITHUB_LOOKUP_LIMIT = 50;

type StoredProfile = {
  headline?: string | null;
  employment_history?: EmploymentEntry[] | null;
  github_url?: string | null;
};

export type OpenToWorkLead = {
  title?: string | null;
  company?: string | null;
  /** The stored profile (Lead.rawApolloData / LeadPoolPerson.profile). */
  profile: unknown;
};

/** Open-to-work level and reasons for each lead, in the same order. */
export async function scoreOpenToWorkForLeads(
  leads: OpenToWorkLead[],
  now = new Date()
): Promise<OpenToWorkResult[]> {
  const profiles = leads.map((lead) => (lead.profile ?? null) as StoredProfile | null);
  const usernames = profiles.map((profile, i) =>
    i < GITHUB_LOOKUP_LIMIT ? githubUsernameFromUrl(profile?.github_url) : null
  );
  const github = await getGithubRecentEvents(
    usernames.filter((name): name is string => Boolean(name)),
    now
  );

  return leads.map((lead, i) => {
    const username = usernames[i];
    return scoreOpenToWork({
      title: lead.title,
      headline: profiles[i]?.headline,
      company: lead.company,
      employmentHistory: profiles[i]?.employment_history,
      githubRecentEvents: username ? github.get(username) ?? null : null,
      layoffs: LAYOFFS,
      now,
    });
  });
}
