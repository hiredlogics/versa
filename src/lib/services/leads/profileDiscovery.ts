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
import { buildLeadWhyReasoning, generateLeadReasoningBatch } from "@/lib/services/ai/leadReasoning";
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
    const scoreContext: LeadScoreContext = {
      originalPrompt: input.prompt,
      searchIntent: input.criteria.searchIntent || input.prompt,
      keywords: Array.isArray(input.criteria.keywords)
        ? input.criteria.keywords.join(" ")
        : input.criteria.keywords || "",
      openToWork: Boolean(input.criteria.openToWork),
      requireEmail: Boolean(input.criteria.requireEmail),
    };
    const whyInputs = profiles.map(({ person, raw }) => ({
      name: person.name, title: person.title, company: person.company, industry: person.industry,
      employees: person.employees, location: person.location,
      hasEmail: isVerifiedEmail(person.email, person.emailStatus), leadScore: 5,
      profileSummary: extractProfileSummary(raw),
    }));
    const reasons = await generateLeadReasoningBatch(whyInputs, scoreContext, {
      userId: input.userId, searchId: input.searchId,
    });
    const rows = profiles.map(({ person, raw }, index) => {
      const verified = isVerifiedEmail(person.email, person.emailStatus);
      const reason = reasons[index] ?? buildLeadWhyReasoning(whyInputs[index], scoreContext);
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
      leadScore: 5,
      priorityLevel: "MEDIUM" as const,
      reasoning: reason.reasoning,
      whySource: reason.source,
      recommendedApproach: "",
      hasEmail: verified,
      rawApolloData: toStoredApolloProfile(raw) ?? undefined,
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
        relaxNote: `Saved ${savedProfiles.toLocaleString()} LinkedIn profile${savedProfiles === 1 ? "" : "s"} after checking ${leadsFetched.toLocaleString()} Apollo matches.`,
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
