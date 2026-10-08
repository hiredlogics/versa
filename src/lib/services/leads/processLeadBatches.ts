import { prisma } from "@/lib/db/prisma";
import { APOLLO_HARD_MAX_RECORDS, getApolloSearchConfig } from "@/lib/apollo-config";
import {
  ApolloCreditsExhaustedError,
  enrichPeopleBatch,
  fetchPeopleBatch,
  formatApolloPerson,
  isUsableEmail,
  type EnrichedApolloResult,
} from "@/lib/apollo";
import {
  buildLeadWhyReasoning,
  generateLeadReasoningBatch,
} from "@/lib/services/ai/leadReasoning";
import { scoreLeadsWithAi, toDbPriority } from "@/lib/services/ai/scoreLead";
import { filterLeadsWithUsableEmail } from "@/lib/services/leads/enrichWhyBatch";
import {
  getMaxAutoBatches,
  getProcessBatchSize,
  getUnlockAttemptBudget,
  getUnlockBatchTimeoutMs,
  requireVerifiedEmail,
  withFetchProgress,
} from "@/lib/services/leads/fetchProgress";
import { isVerifiedEmail } from "@/lib/email-confidence";
import { logLeadFetch, logStageTiming, startStageTimer } from "@/lib/services/leads/fetchLog";
import { filterExcludedLeads } from "@/lib/context/exclusions";
import { normalizeLinkedInUrl } from "@/lib/lead-pool";
import { recordApolloPeopleInPool } from "@/lib/services/leads/leadPool";
import { extractProfileSummary, toStoredApolloProfile } from "@/lib/lead-profile";
import { scoreOpenToWorkForLeads } from "@/lib/services/leads/openToWorkSignals";
import {
  filterPeopleForOpenToWork,
  OPEN_TO_WORK_APOLLO_DISCLAIMER,
  OPEN_TO_WORK_NONE_FOUND,
} from "@/lib/open-to-work";
import type { LeadScoreContext, SearchCriteria, ApolloSearchFilters, ApolloPerson } from "@/lib/types";

export type SequentialBatchResult = {
  activeFilters: ApolloSearchFilters;
  lastPage: number;
  totalPages: number;
  totalAvailable: number;
  apolloRelaxNote?: string;
  batchesCompleted: number;
  leadsFetched: number;
  leadsWithEmail: number;
  peoplePulled: number;
  savedThisRun: number;
  /** Profiles examined for open-to-work title/headline signals (OTW mode). */
  otwScanned?: number;
  otwSignalHits?: number;
  partial: boolean;
  canResume: boolean;
  stopped: boolean;
  creditsExhausted: boolean;
  scoreProvider: string;
  stopReason?: string;
};

function sortLeadsByScoreDesc<T extends { leadScore: number }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => b.leadScore - a.leadScore);
}

function sortLeads<T extends { hasEmail: boolean; leadScore: number }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => {
    const emailDiff = Number(b.hasEmail) - Number(a.hasEmail);
    if (emailDiff !== 0) return emailDiff;
    return b.leadScore - a.leadScore;
  });
}

function batchProgressNote(input: {
  checked: number;
  pool: number;
  withEmail: number;
  batchIndex: number;
  batchSize: number;
  phase: string;
}): string {
  const poolLabel = input.pool > 0 ? input.pool.toLocaleString() : "?";
  return `${input.checked.toLocaleString()} / ${poolLabel} checked → ${input.withEmail.toLocaleString()} with a verified email so far. ${input.phase} (batch ${input.batchIndex}, size ${input.batchSize}).`;
}

function applyEnrichmentToLeads(
  leads: Array<{
    apolloPersonId: string;
    name: string;
    title: string;
    company: string;
    industry: string | null;
    employees: number | null;
    location: string | null;
    email: string | null;
    emailStatus?: string | null;
    linkedinUrl: string | null;
    hasEmail: boolean;
  }>,
  enriched: EnrichedApolloResult[]
): {
  storedById: Map<string, unknown>;
  summaryById: Map<string, string | null>;
} {
  const storedById = new Map<string, unknown>();
  const summaryById = new Map<string, string | null>();
  const byId = new Map(enriched.map((r) => [r.person.id, r]));

  for (const lead of leads) {
    const result = byId.get(lead.apolloPersonId);
    if (!result) continue;
    const full = formatApolloPerson(result.person);
    lead.name = full.name !== "Unknown" ? full.name : lead.name;
    lead.title = full.title !== "N/A" ? full.title : lead.title;
    lead.company = full.company !== "Unknown" ? full.company : lead.company;
    lead.industry = full.industry !== "N/A" ? full.industry : lead.industry;
    lead.employees = full.employees || lead.employees;
    lead.location = full.location !== "N/A" ? full.location : lead.location;
    lead.linkedinUrl = full.linkedinUrl || lead.linkedinUrl;
    if (isUsableEmail(full.email)) {
      lead.email = full.email;
      lead.hasEmail = true;
      lead.emailStatus = full.emailStatus ?? lead.emailStatus ?? null;
    }
    const stored = toStoredApolloProfile(result.raw);
    if (stored) storedById.set(lead.apolloPersonId, stored);
    summaryById.set(lead.apolloPersonId, extractProfileSummary(result.raw));
  }

  return { storedById, summaryById };
}

/**
 * Strict sequential batches: fetch → unlock → filter email → save → progress → next.
 * Never starts batch N+1 until batch N fully finishes.
 */
export async function runSequentialLeadBatches(input: {
  userId: string;
  searchId: string;
  criteria: SearchCriteria;
  prompt: string;
  scoreContext: LeadScoreContext;
  startPage: number;
  resumeFilters?: ApolloSearchFilters;
  seenIds: Set<string>;
  batchesCompleted: number;
  leadsFetched: number;
  leadsWithEmail: number;
  peoplePulled: number;
  /** Cap saves this run (credits / one user-approved batch). */
  maxLeadsThisRun?: number;
  wasStopped: () => Promise<boolean>;
}): Promise<SequentialBatchResult> {
  const batchSize = getProcessBatchSize();
  const maxBatches = getMaxAutoBatches();
  const verifiedOnly = requireVerifiedEmail();
  const unlockTimeoutMs = getUnlockBatchTimeoutMs();
  const maxLeadsThisRun =
    input.maxLeadsThisRun && input.maxLeadsThisRun > 0
      ? input.maxLeadsThisRun
      : batchSize;

  let startPage = Math.max(1, input.startPage);
  let resumeFilters = input.resumeFilters;
  let batchesCompleted = input.batchesCompleted;
  let leadsFetched = input.leadsFetched;
  let leadsWithEmail = input.leadsWithEmail;
  let peoplePulled = input.peoplePulled;
  let activeFilters: ApolloSearchFilters = resumeFilters ??
    input.criteria.apollo ?? {
      personTitles: input.criteria.jobTitles ?? [],
      personLocations: input.criteria.country ? [input.criteria.country] : [],
      includeSimilarTitles: true,
    };
  let lastPage = Math.max(0, startPage - 1);
  let totalPages = 1;
  let totalAvailable = 0;
  let apolloRelaxNote: string | undefined;
  let stopped = false;
  let creditsExhausted = false;
  let stopReason: string | undefined;
  let scoreProvider = "HEURISTIC";
  let savedThisRun = 0;
  let otwScanned = 0;
  let otwSignalHits = 0;
  const openToWorkMode = Boolean(input.criteria.openToWork);

  const batchesThisRunCap = maxBatches === 0 ? Number.POSITIVE_INFINITY : maxBatches;
  const unlockBudget = getUnlockAttemptBudget(batchSize);
  let unlockAttempts = 0;
  let batchesThisRun = 0;

  while (batchesThisRun < batchesThisRunCap) {
    if (await input.wasStopped()) {
      stopped = true;
      stopReason = "stopped_by_user";
      break;
    }

    if (leadsWithEmail >= APOLLO_HARD_MAX_RECORDS) {
      stopReason = "hard_max_records";
      break;
    }

    if (savedThisRun >= maxLeadsThisRun) {
      stopReason = "credit_cap";
      break;
    }

    const batchIndex = batchesCompleted + 1;
    await prisma.leadSearch.update({
      where: { id: input.searchId },
      data: {
        totalAvailable: totalAvailable || undefined,
        relaxNote: batchProgressNote({
          checked: leadsFetched,
          pool: totalAvailable,
          withEmail: leadsWithEmail,
          batchIndex,
          batchSize,
          phase: openToWorkMode
            ? "Fetching matches to scan for open to work signals in titles and headlines…"
            : "Fetching matches…",
        }),
      },
    });

    const fetchTimer = startStageTimer();
    const fetched = await fetchPeopleBatch({
      criteria: input.criteria,
      resumeFilters,
      startPage,
      targetCount: batchSize,
      seenIds: input.seenIds,
      shouldStop: input.wasStopped,
      onProgress: async (page, pages, collected, available) => {
        if (await input.wasStopped()) return;
        await prisma.leadSearch.update({
          where: { id: input.searchId },
          data: {
            totalAvailable: available,
            relaxNote: batchProgressNote({
              checked: leadsFetched + collected,
              pool: available,
              withEmail: leadsWithEmail,
              batchIndex,
              batchSize,
              phase: `Fetching page ${page}/${pages}…`,
            }),
          },
        });
      },
    });

    activeFilters = fetched.activeFilters;
    resumeFilters = fetched.activeFilters;
    lastPage = fetched.lastPage;
    totalPages = fetched.totalPages;
    totalAvailable = fetched.totalAvailable;
    if (fetched.apolloRelaxNote) apolloRelaxNote = fetched.apolloRelaxNote;
    if (fetched.stopped) {
      stopped = true;
      stopReason = "stopped_by_user";
    }
    await recordApolloPeopleInPool(fetched.people, "apollo_search");

    logStageTiming({
      stage: "fetch",
      searchId: input.searchId,
      durationMs: fetchTimer.elapsedMs(),
      ok: true,
      counts: {
        batchIndex,
        peoplePulled: fetched.people.length,
        lastPage,
        totalPages,
        totalAvailable,
      },
    });

    let people = filterExcludedLeads(
      fetched.people,
      input.criteria.excludedTitles ?? [],
      input.criteria.excludedIndustries ?? [],
      input.prompt
    );

    let openToWorkNote = "";
    if (openToWorkMode && people.length > 0) {
      const otw = filterPeopleForOpenToWork(people, { strict: true });
      otwScanned += otw.scanned;
      otwSignalHits += otw.signalCount;
      people = otw.people;
      openToWorkNote = otw.note;
      if (!apolloRelaxNote?.includes("open to work") && !apolloRelaxNote?.includes("Open to work")) {
        apolloRelaxNote = OPEN_TO_WORK_APOLLO_DISCLAIMER;
      }
      logLeadFetch("open_to_work_pre_unlock", {
        searchId: input.searchId,
        batchIndex,
        usedTitleSignals: otw.usedTitleSignals,
        signalCount: otw.signalCount,
        scanned: otw.scanned,
        remaining: people.length,
        otwScannedTotal: otwScanned,
        otwSignalHitsTotal: otwSignalHits,
      });
    }

    if (people.length === 0) {
      logLeadFetch("batch_empty", {
        searchId: input.searchId,
        batchIndex,
        lastPage,
        totalPages,
        openToWorkFiltered: openToWorkMode,
      });
      if (openToWorkMode) {
        peoplePulled += fetched.people.length;
        leadsFetched += fetched.people.length;
        await prisma.leadSearch.update({
          where: { id: input.searchId },
          data: {
            totalAvailable,
            leadsReturned: leadsWithEmail,
            relaxNote: batchProgressNote({
              checked: leadsFetched,
              pool: totalAvailable,
              withEmail: leadsWithEmail,
              batchIndex,
              batchSize,
              phase:
                otwSignalHits > 0
                  ? openToWorkNote || "Checking more pages for open to work signals…"
                  : `Scanned ${otwScanned.toLocaleString()} profiles, ${otwSignalHits} with open to work wording so far. Checking more pages…`,
            }),
          },
        });
      }
      if (fetched.exhausted || lastPage >= totalPages) break;
      // Advance past empty/dupe region
      startPage = lastPage + 1;
      if (startPage > totalPages) break;
      continue;
    }

    // Never carry more people into the paid stage than this batch is allowed.
    if (people.length > batchSize) {
      people = people.slice(0, batchSize);
    }

    const formatted = people.map((p) => {
      const full = formatApolloPerson(p);
      return {
        ...full,
        headline: p.headline ?? null,
        employmentHistory: p.employment_history ?? null,
        rawApolloData: p,
        hasEmail: Boolean(isUsableEmail(full.email) || p.has_email),
      };
    });

    await prisma.leadSearch.update({
      where: { id: input.searchId },
      data: {
        totalAvailable,
        relaxNote: batchProgressNote({
          checked: leadsFetched + people.length,
          pool: totalAvailable,
          withEmail: leadsWithEmail,
          batchIndex,
          batchSize,
          phase: openToWorkNote
            ? `${openToWorkNote} Scoring ${people.length.toLocaleString()}…`
            : `Scoring ${people.length.toLocaleString()}…`,
        }),
      },
    });

    const scoreTimer = startStageTimer();
    const scored = await scoreLeadsWithAi(formatted, input.scoreContext, {
      userId: input.userId,
      searchId: input.searchId,
    });
    scoreProvider = scored.provider;
    logStageTiming({
      stage: "score",
      searchId: input.searchId,
      durationMs: scoreTimer.elapsedMs(),
      ok: true,
      counts: { scored: formatted.length, batchIndex },
      extra: { scoreProvider },
    });

    let workList = sortLeads(
      formatted.map((lead, i) => ({
        apolloPersonId: lead.id,
        name: lead.name,
        title: lead.title,
        company: lead.company,
        industry: lead.industry,
        employees: lead.employees,
        location: lead.location,
        email: lead.email,
        emailStatus: lead.emailStatus ?? null,
        linkedinUrl: lead.linkedinUrl,
        hasEmail: lead.hasEmail,
        leadScore: scored.scores[i].leadScore,
        priorityLevel: toDbPriority(scored.scores[i].priorityLevel),
        reasoning: scored.scores[i].reasoning,
        matchedSkills: scored.scores[i].matchedSkills ?? [],
        missingSkills: scored.scores[i].missingSkills ?? [],
        scorePros: scored.scores[i].pros ?? [],
        scoreCons: scored.scores[i].cons ?? [],
        recommendedApproach: "",
      }))
    );

    // Unlock highest-scored first so credit exhaustion still keeps the best fits,
    // and never spend more unlock credits than this run is allowed.
    const peopleById = new Map(people.map((p) => [p.id, p]));
    const unlockPeople = workList
      .map((lead) => peopleById.get(lead.apolloPersonId))
      .filter((p): p is ApolloPerson => Boolean(p))
      .slice(0, Math.max(0, unlockBudget - unlockAttempts));
    unlockAttempts += unlockPeople.length;

    await prisma.leadSearch.update({
      where: { id: input.searchId },
      data: {
        totalAvailable,
        relaxNote: batchProgressNote({
          checked: leadsFetched + people.length,
          pool: totalAvailable,
          withEmail: leadsWithEmail,
          batchIndex,
          batchSize,
          phase: `Unlocking emails for ${unlockPeople.length.toLocaleString()} (best matches first)…`,
        }),
      },
    });

    const unlockTimer = startStageTimer();
    let enriched: EnrichedApolloResult[] = [];
    try {
      enriched = await enrichPeopleBatch(unlockPeople, {
          deadlineAt: Date.now() + unlockTimeoutMs,
          shouldStop: input.wasStopped,
          onProgress: async (done, total) => {
            if (await input.wasStopped()) return;
            await prisma.leadSearch.update({
              where: { id: input.searchId },
              data: {
                relaxNote: batchProgressNote({
                  checked: leadsFetched + people.length,
                  pool: totalAvailable,
                  withEmail: leadsWithEmail,
                  batchIndex,
                  batchSize,
                  phase: `Unlocking emails ${done.toLocaleString()}/${total.toLocaleString()}…`,
                }),
              },
            });
          },
        });
      logStageTiming({
        stage: "unlock",
        searchId: input.searchId,
        durationMs: unlockTimer.elapsedMs(),
        ok: true,
        counts: {
          batchIndex,
          attempted: people.length,
          unlocked: enriched.filter((r) => isUsableEmail(r.person.email)).length,
        },
      });
    } catch (error) {
      if (error instanceof ApolloCreditsExhaustedError) {
        enriched = error.partial;
        creditsExhausted = true;
        stopReason = "apollo_credits_exhausted";
        logStageTiming({
          stage: "unlock",
          searchId: input.searchId,
          durationMs: unlockTimer.elapsedMs(),
          ok: false,
          counts: { batchIndex, attempted: people.length, partial: enriched.length },
          error: error.message,
        });
      } else {
        logStageTiming({
          stage: "unlock",
          searchId: input.searchId,
          durationMs: unlockTimer.elapsedMs(),
          ok: false,
          counts: { batchIndex, attempted: people.length },
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    // Only people Apollo actually matched were checked; the rest are padding.
    await recordApolloPeopleInPool(
      enriched.filter((r) => r.raw).map((r) => r.person),
      "apollo_enrich",
      { emailChecked: true }
    );
    const { storedById, summaryById } = applyEnrichmentToLeads(workList, enriched);

    // Skip anyone this search already delivered, e.g. from the lead pool.
    workList = workList.filter((lead) => {
      const key = normalizeLinkedInUrl(lead.linkedinUrl);
      return !key || !input.seenIds.has(key);
    });
    const withAnyEmail = filterLeadsWithUsableEmail(workList);
    const keep = verifiedOnly
      ? withAnyEmail.filter((lead) => isVerifiedEmail(lead.email, lead.emailStatus))
      : withAnyEmail;
    const skippedUnverified = withAnyEmail.length - keep.length;
    workList = sortLeads(keep);

    // Only the leads we are about to save get a Why, so the AI call stays small.
    const remainingSlots = Math.max(0, maxLeadsThisRun - savedThisRun);
    workList = workList.slice(0, remainingSlots);

    const whyInputs = workList.map((lead) => ({
      name: lead.name,
      title: lead.title,
      company: lead.company,
      industry: lead.industry ?? "N/A",
      employees: lead.employees ?? 0,
      location: lead.location ?? "N/A",
      hasEmail: true,
      leadScore: lead.leadScore,
      profileSummary: summaryById.get(lead.apolloPersonId) ?? null,
    }));

    const whyResults = await generateLeadReasoningBatch(whyInputs, input.scoreContext, {
      userId: input.userId,
      searchId: input.searchId,
    });

    const whySourceByApolloId = new Map(
      workList.map((lead, i) => [lead.apolloPersonId, whyResults[i]?.source ?? "TEMPLATE"])
    );
    workList = workList.map((lead, i) => {
      const baseWhy =
        whyResults[i]?.reasoning ||
        buildLeadWhyReasoning(whyInputs[i], input.scoreContext).reasoning;
      return {
        ...lead,
        email: lead.email!.trim(),
        hasEmail: true,
        reasoning: openToWorkMode
          ? `Open to work signal in title or headline. ${baseWhy}`
          : baseWhy,
        recommendedApproach: "",
      };
    });

    const otwScores = await scoreOpenToWorkForLeads(
      workList.map((lead) => ({
        title: lead.title,
        company: lead.company,
        profile: storedById.get(lead.apolloPersonId),
      }))
    );

    const leadRows = workList.map((lead, i) => ({
      userId: input.userId,
      searchId: input.searchId,
      apolloPersonId: lead.apolloPersonId,
      name: lead.name,
      title: lead.title,
      company: lead.company,
      industry: lead.industry,
      employees: lead.employees,
      location: lead.location,
      email: lead.email,
      emailStatus: lead.emailStatus ?? null,
      linkedinUrl: lead.linkedinUrl,
      leadScore: lead.leadScore,
      priorityLevel: lead.priorityLevel,
      reasoning: lead.reasoning,
      matchedSkills: lead.matchedSkills ?? [],
      missingSkills: lead.missingSkills ?? [],
      scorePros: lead.scorePros ?? [],
      scoreCons: lead.scoreCons ?? [],
      openToWorkLevel: otwScores[i].level,
      openToWorkReasons: otwScores[i].reasons,
      whySource: whySourceByApolloId.get(lead.apolloPersonId) ?? "TEMPLATE",
      recommendedApproach: "",
      hasEmail: true,
      rawApolloData: (storedById.get(lead.apolloPersonId) as object | undefined) ?? undefined,
    }));

    let batchSaved = 0;
    for (let i = 0; i < leadRows.length; i += 500) {
      const chunk = leadRows.slice(i, i + 500);
      const result = await prisma.lead.createMany({ data: chunk });
      batchSaved += result.count;
    }
    for (const lead of workList) {
      const key = normalizeLinkedInUrl(lead.linkedinUrl);
      if (key) input.seenIds.add(key);
    }

    leadsFetched += people.length;
    peoplePulled += people.length;
    leadsWithEmail += batchSaved;
    savedThisRun += batchSaved;
    batchesCompleted += 1;
    batchesThisRun += 1;

    // Mark this batch complete in _progress before starting the next
    const hitSaveCap = savedThisRun >= maxLeadsThisRun;
    const morePages = lastPage < totalPages && !stopped && !creditsExhausted && !hitSaveCap;
    const underAutoCap = maxBatches === 0 || batchesThisRun < maxBatches;
    const canResumeMore =
      (morePages || (lastPage < totalPages && hitSaveCap)) &&
      leadsWithEmail < APOLLO_HARD_MAX_RECORDS;

    await prisma.leadSearch.update({
      where: { id: input.searchId },
      data: {
        status: "RUNNING",
        errorMessage: null,
        totalAvailable,
        leadsReturned: leadsWithEmail,
        apolloFilters: withFetchProgress(activeFilters, {
          lastPage,
          totalPages,
          partial: lastPage < totalPages || hitSaveCap,
          canResume: canResumeMore && lastPage < totalPages,
          peoplePulled,
          savedCount: leadsWithEmail,
          batchesCompleted,
          leadsFetched,
          leadsWithEmail,
          emailsUnlockedCount: leadsWithEmail,
          totalToUnlock: totalAvailable,
        }) as object,
        relaxNote: batchProgressNote({
          checked: leadsFetched,
          pool: totalAvailable,
          withEmail: leadsWithEmail,
          batchIndex,
          batchSize,
          phase: creditsExhausted
            ? "Paused: we can't look up more people right now. This batch is saved."
            : hitSaveCap || !underAutoCap || unlockAttempts >= unlockBudget
              ? `${skippedUnverified.toLocaleString()} of ${unlockAttempts.toLocaleString()} checked had no verified email. Click Get next 100 to check more people.`
              : morePages
                ? "Checking more people for verified emails…"
                : "All available pages processed.",
        }),
      },
    });

    logLeadFetch("batch_complete", {
      searchId: input.searchId,
      batchIndex,
      fetched: people.length,
      savedWithEmail: batchSaved,
      skippedUnverified,
      leadsFetched,
      leadsWithEmail,
      lastPage,
      totalPages,
    });

    if (creditsExhausted || stopped || hitSaveCap) {
      if (hitSaveCap) stopReason = "credit_cap";
      break;
    }
    // Verified emails are a minority, so a run keeps checking more people until
    // it fills the batch or spends its unlock budget, whichever comes first.
    if (unlockAttempts >= unlockBudget) {
      stopReason = "unlock_budget";
      break;
    }
    if (!morePages) break;

    // Next batch starts only after this one fully finished
    startPage = lastPage + 1;
  }

  const hitAutoCap =
    maxBatches > 0 &&
    batchesThisRun >= maxBatches &&
    lastPage < totalPages &&
    !stopped &&
    !creditsExhausted;
  if (hitAutoCap && !stopReason) {
    stopReason = "max_auto_batches";
  }

  if (openToWorkMode && savedThisRun === 0 && otwScanned > 0) {
    apolloRelaxNote = `${OPEN_TO_WORK_NONE_FOUND} Scanned ${otwScanned.toLocaleString()} profiles; ${otwSignalHits} had open to work wording.`;
  } else if (openToWorkMode && savedThisRun > 0) {
    apolloRelaxNote = `${OPEN_TO_WORK_APOLLO_DISCLAIMER} Saved ${savedThisRun} after scanning ${otwScanned.toLocaleString()} profiles (${otwSignalHits} with signals).`;
  }

  const canResume =
    lastPage < totalPages &&
    leadsWithEmail < APOLLO_HARD_MAX_RECORDS &&
    !stopped;

  return {
    activeFilters,
    lastPage,
    totalPages,
    totalAvailable,
    apolloRelaxNote,
    batchesCompleted,
    leadsFetched,
    leadsWithEmail,
    peoplePulled,
    savedThisRun,
    otwScanned: openToWorkMode ? otwScanned : undefined,
    otwSignalHits: openToWorkMode ? otwSignalHits : undefined,
    partial: lastPage < totalPages || Boolean(hitAutoCap) || creditsExhausted,
    canResume: canResume && lastPage < totalPages,
    stopped,
    creditsExhausted,
    scoreProvider,
    stopReason,
  };
}
