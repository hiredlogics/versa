import { prisma } from "@/lib/db/prisma";
import { APOLLO_HARD_MAX_RECORDS } from "@/lib/apollo-config";
import {
  fetchPeopleBatch,
  formatApolloPerson,
  revealEmailsForPeople,
} from "@/lib/apollo";
import { filterExcludedLeads } from "@/lib/context/exclusions";
import { filterByLlmTitles } from "@/lib/role-policy";
import { getMaxAutoBatches, getProcessBatchSize } from "@/lib/services/leads/fetchProgress";
import { findMatchedPoolPeople, recordApolloPeopleInPool } from "@/lib/services/leads/leadPool";
import { normalizeLinkedInUrl } from "@/lib/lead-pool";
import { isVerifiedEmail } from "@/lib/email-confidence";
import { extractProfileSummary, toStoredApolloProfile } from "@/lib/lead-profile";
import { scoreOpenToWorkForLeads } from "@/lib/services/leads/openToWorkSignals";
import { buildLeadWhyReasoning, generateLeadReasoningBatch } from "@/lib/services/ai/leadReasoning";
import { scoreLeadsWithAi, toDbPriority } from "@/lib/services/ai/scoreLead";
import type { ApolloSearchFilters, LeadScoreContext, SearchCriteria } from "@/lib/types";

/**
 * Each search page is profile-enriched once through Apollo bulk_match before saving.
 */
export type ProfileDiscoveryResult = {
  activeFilters: ApolloSearchFilters;
  lastPage: number;
  totalPages: number;
  totalAvailable: number;
  apolloRelaxNote?: string;
  batchesCompleted: number;
  leadsFetched: number;
  /** Kept for compatibility with existing progress storage; it means profiles saved. */
  leadsWithEmail: number;
  peoplePulled: number;
  savedThisRun: number;
  otwScanned?: number;
  otwSignalHits?: number;
  partial: boolean;
  canResume: boolean;
  stopped: boolean;
  creditsExhausted: boolean;
  scoreProvider: string;
  stopReason?: string;
};

export async function runProfileDiscovery(input: {
  userId: string;
  searchId: string;
  criteria: SearchCriteria;
  prompt: string;
  startPage: number;
  resumeFilters?: ApolloSearchFilters;
  seenIds: Set<string>;
  batchesCompleted: number;
  leadsFetched: number;
  leadsWithEmail: number;
  peoplePulled: number;
  maxLeadsThisRun: number;
  wasStopped: () => Promise<boolean>;
  scoreContext: LeadScoreContext;
}): Promise<ProfileDiscoveryResult> {
  const batchSize = getProcessBatchSize();
  const maxBatches = getMaxAutoBatches();
  let startPage = Math.max(1, input.startPage);
  let activeFilters = input.resumeFilters ?? input.criteria.apollo!;
  let lastPage = startPage - 1;
  let totalPages = 1;
  let totalAvailable = input.leadsWithEmail;
  let batchesCompleted = input.batchesCompleted;
  let leadsFetched = input.leadsFetched;
  let savedProfiles = input.leadsWithEmail;
  let peoplePulled = input.peoplePulled;
  let savedThisRun = 0;
  let stopped = false;
  let apolloRelaxNote: string | undefined;
  let stopReason: string | undefined;
  let creditsExhausted = false;

  for (let batches = 0; batches < (maxBatches || Number.POSITIVE_INFINITY); batches++) {
    if (await input.wasStopped()) {
      stopped = true;
      stopReason = "stopped_by_user";
      break;
    }
    if (savedThisRun >= input.maxLeadsThisRun || savedProfiles >= APOLLO_HARD_MAX_RECORDS) {
      stopReason = "credit_cap";
      break;
    }

    const fetched = await fetchPeopleBatch({
      criteria: input.criteria,
      resumeFilters: input.resumeFilters ?? activeFilters,
      startPage,
      targetCount: batchSize,
      seenIds: input.seenIds,
      shouldStop: input.wasStopped,
    });
    activeFilters = fetched.activeFilters;
    lastPage = fetched.lastPage;
    totalPages = fetched.totalPages;
    totalAvailable = fetched.totalAvailable;
    apolloRelaxNote = fetched.apolloRelaxNote ?? apolloRelaxNote;
    stopped ||= fetched.stopped;
    if (fetched.stopped) stopReason = "stopped_by_user";
    await recordApolloPeopleInPool(fetched.people, "apollo_search");

    const remaining = input.maxLeadsThisRun - savedThisRun;
    const candidates = filterByLlmTitles(filterExcludedLeads(
      fetched.people,
      input.criteria.excludedTitles ?? [],
      input.criteria.excludedIndustries ?? [],
      input.prompt
    ), input.criteria.jobTitles).slice(0, remaining);

    const pooled = await findMatchedPoolPeople(candidates);
    const pooledById = new Map(pooled.map((person) => [person.apolloPersonId, person]));
    const reveal = await revealEmailsForPeople(
      candidates.filter((person) => !pooledById.has(person.id)).map((person) => ({ id: person.id, linkedinUrl: person.linkedin_url })),
      { revealPersonalEmails: Boolean(input.criteria.requireEmail) }
    );
    if (reveal.creditsExhausted) {
      creditsExhausted = true;
      stopReason = "apollo_credits_exhausted";
    }
    const matched = reveal.results.filter((result): result is NonNullable<typeof result> => Boolean(result));
    await recordApolloPeopleInPool(
      matched.map(({ person }) =>
        isVerifiedEmail(person.email, person.email_status)
          ? person
          : { ...person, email: null, email_status: null, has_email: false }
      ),
      "apollo_enrich",
      { emailChecked: true }
    );

    const profiles = [
      ...pooled.map((person) => ({
        person: {
          id: person.apolloPersonId || "",
          name: person.name,
          title: person.title,
          company: person.company || "Unknown",
          industry: person.industry || "N/A",
          employees: person.employees || 0,
          location: [person.city, person.state, person.country].filter(Boolean).join(", ") || "N/A",
          email: person.email,
          emailStatus: person.emailStatus,
          linkedinUrl: person.linkedinUrl,
        }, raw: null,
      })),
      ...matched.map((result) => ({ person: formatApolloPerson(result.person), raw: result.raw })),
    ].filter(({ person }) => {
      const key = normalizeLinkedInUrl(person.linkedinUrl);
      if (!key || input.seenIds.has(key)) return false;
      input.seenIds.add(key);
      return true;
    });
    const storedProfiles = profiles.map(({ raw }) => toStoredApolloProfile(raw));
    const meta = { userId: input.userId, searchId: input.searchId };
    // Real scores (with pros and cons) instead of a fixed 5 for every profile.
    const scored = await scoreLeadsWithAi(
      profiles.map(({ person, raw }, index) => ({
        name: person.name,
        title: person.title,
        company: person.company,
        industry: person.industry,
        employees: person.employees || 0,
        location: person.location,
        hasEmail: isVerifiedEmail(person.email, person.emailStatus),
        headline: raw?.headline ?? null,
        rawApolloData: storedProfiles[index],
      })),
      input.scoreContext,
      meta
    );
    const aiScored = scored.provider !== "HEURISTIC";
    // The scoring call already writes a reason; only ask the AI again when scoring fell back.
    const whyInputs = profiles.map(({ person, raw }, index) => ({
      name: person.name, title: person.title, company: person.company, industry: person.industry,
      employees: person.employees, location: person.location,
      hasEmail: isVerifiedEmail(person.email, person.emailStatus),
      leadScore: scored.scores[index].leadScore,
      profileSummary: extractProfileSummary(raw),
    }));
    const reasons = aiScored
      ? scored.scores.map((score) => ({ reasoning: score.reasoning, source: "AI" as const }))
      : await generateLeadReasoningBatch(whyInputs, input.scoreContext, meta);
    const otwScores = await scoreOpenToWorkForLeads(
      profiles.map(({ person }, index) => ({
        title: person.title,
        company: person.company,
        profile: storedProfiles[index],
      }))
    );
    const rows = profiles.map(({ person, raw }, index) => {
      const verified = isVerifiedEmail(person.email, person.emailStatus);
      const reason = reasons[index] ?? buildLeadWhyReasoning(whyInputs[index], input.scoreContext);
      const score = scored.scores[index];
      return {
      userId: input.userId,
      searchId: input.searchId,
      apolloPersonId: person.id,
      name: person.name,
      title: person.title,
      company: person.company,
      industry: person.industry,
      employees: person.employees || null,
      location: person.location,
      email: verified ? person.email : null,
      emailStatus: verified ? person.emailStatus : null,
      linkedinUrl: person.linkedinUrl,
      leadScore: score.leadScore,
      priorityLevel: toDbPriority(score.priorityLevel),
      reasoning: reason.reasoning,
      whySource: reason.source,
      recommendedApproach: "",
      matchedSkills: score.matchedSkills ?? [],
      missingSkills: score.missingSkills ?? [],
      scorePros: score.pros ?? [],
      scoreCons: score.cons ?? [],
      openToWorkLevel: otwScores[index].level,
      openToWorkReasons: otwScores[index].reasons,
      hasEmail: verified,
      rawApolloData: storedProfiles[index] ?? undefined,
    };
    });
    if (rows.length) await prisma.lead.createMany({ data: rows });

    leadsFetched += fetched.people.length;
    peoplePulled += fetched.people.length;
    savedProfiles += rows.length;
    savedThisRun += rows.length;
    batchesCompleted += 1;

    await prisma.leadSearch.update({
      where: { id: input.searchId },
      data: {
        totalAvailable,
        leadsReturned: savedProfiles,
        relaxNote: `Saved ${savedProfiles.toLocaleString()} LinkedIn profile${savedProfiles === 1 ? "" : "s"} after checking ${leadsFetched.toLocaleString()} matching people.`,
      },
    });

    if (fetched.exhausted || stopped || creditsExhausted || savedThisRun >= input.maxLeadsThisRun) break;
    startPage = lastPage + 1;
    if (startPage > totalPages) break;
  }

  const canResume = !stopped && lastPage < totalPages && savedProfiles < APOLLO_HARD_MAX_RECORDS;
  return {
    activeFilters,
    lastPage: Math.max(lastPage, 0),
    totalPages,
    totalAvailable,
    apolloRelaxNote,
    batchesCompleted,
    leadsFetched,
    leadsWithEmail: savedProfiles,
    peoplePulled,
    savedThisRun,
    partial: canResume,
    canResume,
    stopped,
    creditsExhausted,
    scoreProvider: "HEURISTIC",
    stopReason,
  };
}
