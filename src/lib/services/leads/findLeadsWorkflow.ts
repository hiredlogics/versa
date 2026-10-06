import { prisma } from "@/lib/db/prisma";
import {
  APOLLO_HARD_MAX_RECORDS,
  getApolloSearchConfig,
  getLeadSearchConfig,
  shouldIgnoreLeadContext,
} from "@/lib/apollo-config";
import { runProfileDiscovery } from "@/lib/services/leads/profileDiscovery";
import {
  runSequentialLeadBatches,
  type SequentialBatchResult,
} from "@/lib/services/leads/processLeadBatches";
import { serveFromPool, type PoolServeResult } from "@/lib/services/leads/leadPool";
import { buildScoringContextFromLeadContext } from "@/lib/context/exclusions";
import { poolPersonKeys, promptAsksForEmail } from "@/lib/lead-pool";
import { assertApolloConfigured } from "@/lib/platform-readiness";
import { parsePromptWithAi } from "@/lib/services/ai/parsePrompt";
import {
  incrementUsage,
  requireLeadSearchAccess,
} from "@/lib/services/billing/usageLimits";
import { mapLeadToRecord } from "@/lib/services/searches/searchHistory";
import { getUserLeadContext } from "@/lib/context/userLeadContext";
import {
  withFetchProgress,
  stripFetchProgress,
  readFetchProgress,
  canResumeSearch,
  estimateResumePage,
  getProcessBatchSize,
} from "@/lib/services/leads/fetchProgress";
import { USER_STOPPED_MESSAGE } from "@/lib/services/leads/searchControl";
import { toUserFacingSearchError } from "@/lib/services/leads/searchError";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";
import { extractRequestedLeadCount, type ClarificationNeed } from "@/lib/clarifyPrompt";
import { clarifyWithAi } from "@/lib/services/ai/clarifyWithAi";
import { resolveSupportedCountry } from "@/lib/location-policy";
import { Prisma, type User, type AiProvider } from "@prisma/client";
import { rescoreSearchLeads } from "@/lib/services/leads/rescoreSearch";
import type { SearchCriteria, ApolloSearchFilters } from "@/lib/types";
import {
  parseJobDescription,
  buildSearchPromptFromJobDescription,
  type ParsedJobDescription,
} from "@/lib/services/ai/parseJobDescription";

export { USER_STOPPED_MESSAGE, canResumeSearch };

export interface FindLeadsInput {
  prompt: string;
  inputType?: string;
  jobDescription?: string;
  jobRequirements?: ParsedJobDescription | null;
  minScore?: number;
  /** User-requested lead count for this run (clamped to credits + one batch). */
  requestedLeadCount?: number;
  skipClarification?: boolean;
}

export type FindLeadsStartResult = {
  searchId: string;
  status: "RUNNING";
  criteria: ReturnType<typeof criteriaForClient>;
  totalAvailable?: number;
  message: string;
  async: true;
};

/**
 * For job description searches: read the description once (or reuse the requirements a
 * follow-up sends back), then search with a short prompt built from them. `input.prompt`
 * is only the user's follow-up text here, never the description itself.
 */
async function resolvePromptAndRequirements(
  input: FindLeadsInput,
  userId?: string
): Promise<{ prompt: string; jobRequirements: ParsedJobDescription | null }> {
  if (input.inputType !== "job_description") {
    return { prompt: input.prompt, jobRequirements: null };
  }

  const jobRequirements =
    input.jobRequirements !== undefined
      ? input.jobRequirements
      : await parseJobDescription(input.jobDescription ?? "", { userId });
  // If the description could not be read, search with its text like a normal prompt.
  const base = jobRequirements
    ? buildSearchPromptFromJobDescription(jobRequirements)
    : (input.jobDescription ?? "").trim();
  const prompt = [base, input.prompt.trim()].filter(Boolean).join(". ");
  return { prompt, jobRequirements };
}

/**
 * Every person this user already has a lead for, in any search. A new search treats
 * them as already seen, so asking again (even in other words) brings new people and
 * never charges twice for the same person.
 */
async function userLeadKeys(userId: string): Promise<Set<string>> {
  const leads = await prisma.lead.findMany({
    where: { userId, deletedAt: null },
    select: { apolloPersonId: true, linkedinUrl: true },
  });
  return new Set(leads.flatMap((lead) => poolPersonKeys(lead)));
}

type JobSkillLists = { mustHaveSkills?: string[]; niceToHaveSkills?: string[] };

/**
 * Skills to judge each lead against: the job description's skills when the search has
 * them, otherwise the comma-separated keywords (so "machine learning" stays one skill).
 */
export function targetSkillsForSearch(
  jobRequirements: JobSkillLists | null | undefined,
  keywords: string | undefined
): string[] | undefined {
  const fromJob = [
    ...(jobRequirements?.mustHaveSkills ?? []),
    ...(jobRequirements?.niceToHaveSkills ?? []),
  ];
  const source = fromJob.length > 0 ? fromJob : (keywords ?? "").split(/[,;]/);
  const unique = new Map<string, string>();
  for (const raw of source) {
    const skill = raw.trim();
    if (skill.length > 1 && !unique.has(skill.toLowerCase())) unique.set(skill.toLowerCase(), skill);
  }
  const skills = [...unique.values()].slice(0, 16);
  return skills.length > 0 ? skills : undefined;
}

function toDbAiProvider(provider: string, fallback: string): AiProvider {
  const allowed = new Set(["OPENAI", "GROQ", "GEMINI", "CLAUDE", "HEURISTIC"]);
  if (allowed.has(provider)) return provider as AiProvider;
  if (allowed.has(fallback)) return fallback as AiProvider;
  return "HEURISTIC";
}

/** Shape the UI / search history expect (ParsedSearchCriteria + OTW fields). */
export function criteriaForClient(criteria: SearchCriteria) {
  const titles = criteria.jobTitles?.slice(0, 4) ?? [];
  const role = titles[0] || "professionals";
  const where = criteria.country ? ` in ${criteria.country}` : "";
  const intentSummary = criteria.openToWork
    ? `${role}${where} who wrote open-to-work / job-seeking wording in their title or headline. We scan matches, unlock email only for those signals, and save them`
    : // Only a real summary: the raw search text can hold internal instructions.
      criteria.summary || "";

  return {
    industry: criteria.industry ?? null,
    country: criteria.country ?? null,
    city: criteria.city ?? null,
    state: criteria.state ?? null,
    companySizeMin: criteria.companySizeMin ?? null,
    companySizeMax: criteria.companySizeMax ?? null,
    jobTitles: criteria.jobTitles ?? [],
    seniorityLevels: [] as string[],
    keywords: criteria.keywords
      ? criteria.keywords.split(/[,\s]+/).filter(Boolean).slice(0, 8)
      : [],
    companyNames: [] as string[],
    companyDomains: [] as string[],
    linkedinUrls: [] as string[],
    intentSummary,
    openToWork: Boolean(criteria.openToWork),
    requireEmail: Boolean(criteria.requireEmail),
    searchIntent: criteria.searchIntent,
    summary: criteria.summary,
  };
}

async function wasStoppedByUser(searchId: string): Promise<boolean> {
  const row = await prisma.leadSearch.findUnique({
    where: { id: searchId },
    select: { errorMessage: true },
  });
  return row?.errorMessage === USER_STOPPED_MESSAGE;
}

type SearchStepResult = {
  result: SequentialBatchResult;
  pool: PoolServeResult;
  /** Leads that cost Apollo credits this step; these count against the plan. */
  charged: number;
};

/**
 * One user-approved step of a search. Matching people already in the shared
 * lead pool are delivered first; Apollo is only asked for the remainder. When
 * the user wants emails, the email-unlock pipeline runs, otherwise the
 * LinkedIn-profile-only pipeline does.
 */
async function runSearchStep(args: {
  userId: string;
  searchId: string;
  criteria: SearchCriteria;
  prompt: string;
  wantsEmail: boolean;
  leadContext: Awaited<ReturnType<typeof getUserLeadContext>> | null;
  startPage: number;
  resumeFilters?: ApolloSearchFilters;
  seenIds: Set<string>;
  batchesCompleted: number;
  leadsFetched: number;
  leadsWithEmail: number;
  peoplePulled: number;
  totalAvailable?: number | null;
  maxLeadsThisRun: number;
}): Promise<SearchStepResult> {
  const searchRow = await prisma.leadSearch.update({
    where: { id: args.searchId },
    data: { relaxNote: "Looking for matching people…" },
    select: { jobRequirements: true },
  });

  // One scoring setup for every way a lead can be saved (pool, email search, profiles),
  // so no lead is saved with a fixed placeholder score.
  const scoreContext = buildScoringContextFromLeadContext(
    args.leadContext,
    {
      searchIntent: args.criteria.searchIntent,
      keywords: args.criteria.keywords,
      excludedTitles: args.criteria.excludedTitles,
      excludedIndustries: args.criteria.excludedIndustries,
      targetSkills: targetSkillsForSearch(
        searchRow.jobRequirements as JobSkillLists | null,
        args.criteria.keywords
      ),
    },
    args.prompt
  );
  scoreContext.openToWork = args.criteria.openToWork;
  scoreContext.requireEmail = args.wantsEmail;

  // After new leads are saved, score the whole search again side by side.
  const compareLeads = async (savedThisStep: number) => {
    if (savedThisStep <= 0) return;
    try {
      await prisma.leadSearch.update({
        where: { id: args.searchId },
        data: { relaxNote: "Comparing the leads with each other to finish their scores…" },
      });
      await rescoreSearchLeads({ userId: args.userId, searchId: args.searchId, scoreContext });
    } catch (error) {
      console.warn("[findLeads] comparing scores skipped:", error instanceof Error ? error.message : error);
    }
  };

  const pool = await serveFromPool({
    userId: args.userId,
    searchId: args.searchId,
    criteria: args.criteria,
    prompt: args.prompt,
    limit: args.maxLeadsThisRun,
    wantsEmail: args.wantsEmail,
    seenIds: args.seenIds,
    scoreContext,
  });

  const remaining = args.maxLeadsThisRun - pool.saved;
  const savedSoFar = args.leadsWithEmail + pool.saved;

  const stoppedNow = await wasStoppedByUser(args.searchId);
  if (remaining <= 0 || pool.creditsExhausted || stoppedNow) {
    // Nothing left to fetch this step. Apollo pages are untouched, so the
    // next "Get next 100" starts from the same page.
    await compareLeads(pool.saved);
    return {
      pool,
      charged: pool.unlockedSaved,
      result: {
        activeFilters: args.resumeFilters ?? args.criteria.apollo!,
        lastPage: args.startPage - 1,
        totalPages: Math.max(args.startPage, 1),
        totalAvailable: Math.max(args.totalAvailable ?? 0, savedSoFar),
        batchesCompleted: args.batchesCompleted,
        leadsFetched: args.leadsFetched,
        leadsWithEmail: savedSoFar,
        peoplePulled: args.peoplePulled,
        savedThisRun: 0,
        partial: true,
        canResume: true,
        stopped: stoppedNow,
        creditsExhausted: pool.creditsExhausted,
        scoreProvider: "HEURISTIC",
        stopReason: stoppedNow
          ? "stopped_by_user"
          : pool.creditsExhausted
            ? "apollo_credits_exhausted"
            : "credit_cap",
      },
    };
  }

  const common = {
    userId: args.userId,
    searchId: args.searchId,
    criteria: args.criteria,
    prompt: args.prompt,
    startPage: args.startPage,
    resumeFilters: args.resumeFilters,
    seenIds: args.seenIds,
    batchesCompleted: args.batchesCompleted,
    leadsFetched: args.leadsFetched,
    leadsWithEmail: savedSoFar,
    peoplePulled: args.peoplePulled,
    maxLeadsThisRun: remaining,
    wasStopped: () => wasStoppedByUser(args.searchId),
    scoreContext,
  };

  const result: SequentialBatchResult = args.wantsEmail
    ? await runSequentialLeadBatches(common)
    : await runProfileDiscovery(common);
  await compareLeads(pool.saved + result.savedThisRun);

  return { result, pool, charged: result.savedThisRun + pool.unlockedSaved };
}

/** Where leads came from (our saved pool or a new lookup) is internal, so users never see it. */
const OUT_OF_LOOKUPS =
  " We can't look up more people right now. Please try again later, then click Get next 100.";

/**
 * Parse prompt and decide if we need clarifying questions before spending credits.
 * Does not create a LeadSearch row.
 */
export async function previewFindClarification(
  user: User,
  input: FindLeadsInput
): Promise<{
  prompt: string;
  criteria: SearchCriteria;
  clientCriteria: ReturnType<typeof criteriaForClient>;
  parseProvider: string;
  clarification: ClarificationNeed;
  leadsRemaining: number;
  jobRequirements?: ParsedJobDescription | null;
}> {
  assertApolloConfigured();
  const { prompt, jobRequirements } = await resolvePromptAndRequirements(input, user.id);
  input.jobRequirements = jobRequirements;
  const ignoreContext = shouldIgnoreLeadContext();
  const leadContext = ignoreContext ? null : await getUserLeadContext(user.id);

  const access = await requireLeadSearchAccess(user, input.requestedLeadCount);
  const parsed = await parsePromptWithAi(prompt, {
    userId: user.id,
    leadContext,
  });
  const criteria = resolveSupportedCountry(parsed.criteria);
  const parseProvider = parsed.provider;

  // Count only what the user typed: numbers inside a job description ("manage 10 people")
  // are not a lead count.
  const fromPrompt = extractRequestedLeadCount(
    input.inputType === "job_description" ? input.prompt : prompt
  );
  const clarification = await clarifyWithAi(prompt, criteria, {
    leadContext,
    userId: user.id,
    requestedLeadCount: input.requestedLeadCount ?? fromPrompt,
  });
  if (input.requestedLeadCount || fromPrompt) {
    clarification.requestedLeadCount =
      input.requestedLeadCount ?? fromPrompt ?? clarification.requestedLeadCount;
  }

  return {
    prompt,
    criteria,
    clientCriteria: criteriaForClient(criteria),
    parseProvider,
    clarification,
    leadsRemaining: access.leadsRemaining,
    jobRequirements,
  };
}

/**
 * Starts a search: parse prompt, create RUNNING row, return immediately.
 * Heavy pagination continues in `runFindLeadsJob`.
 */
export async function startFindLeadsWorkflow(
  user: User,
  input: FindLeadsInput
): Promise<{
  searchId: string;
  status: "RUNNING";
  clientCriteria: ReturnType<typeof criteriaForClient>;
  rawCriteria: SearchCriteria;
  prompt: string;
  parseProvider: string;
  message: string;
  async: true;
  leadsRemaining: number;
  batchSize: number;
  jobRequirements?: ParsedJobDescription | null;
}> {
  assertApolloConfigured();

  const { prompt, jobRequirements } = await resolvePromptAndRequirements(input, user.id);
  const ignoreContext = shouldIgnoreLeadContext();
  const leadContext = ignoreContext ? null : await getUserLeadContext(user.id);
  const batchSize = getProcessBatchSize();

  const requestedCap =
    input.requestedLeadCount && input.requestedLeadCount > 0
      ? Math.min(input.requestedLeadCount, batchSize)
      : batchSize;

  const access = await requireLeadSearchAccess(user, requestedCap);

  const search = await prisma.leadSearch.create({
    data: {
      userId: user.id,
      prompt,
      inputType: input.inputType || "prompt",
      status: "RUNNING",
      relaxNote: "Parsing your prompt…",
      jobRequirements: (jobRequirements as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  });

  try {
    const parsed = await parsePromptWithAi(prompt, {
      userId: user.id,
      searchId: search.id,
      leadContext,
    });
    const criteria = resolveSupportedCountry(parsed.criteria);
    const parseProvider = parsed.provider;
    const parseMode = parsed.parseMode;

    logLeadFetch("search_started", {
      searchId: search.id,
      userId: user.id,
      parseProvider,
      parseMode,
      titles: criteria.apollo?.personTitles?.slice(0, 5) ?? [],
      locations: criteria.apollo?.personLocations ?? [],
      qKeywords: criteria.apollo?.qKeywords ?? null,
      requestedLeadCount: input.requestedLeadCount ?? null,
      batchSize,
      leadsRemaining: access.leadsRemaining,
    });

    const clientCriteria = criteriaForClient(criteria);

    await prisma.leadSearch.update({
      where: { id: search.id },
      data: {
        parsedCriteria: clientCriteria as object,
        apolloFilters: criteria.apollo as object,
        relaxNote: `Finding up to ${Math.min(batchSize, access.leadsRemaining).toLocaleString()} leads this step…`,
      },
    });

    return {
      searchId: search.id,
      status: "RUNNING",
      clientCriteria,
      rawCriteria: criteria,
      prompt,
      parseProvider,
      message: `Search started — unlocking up to ${Math.min(batchSize, access.leadsRemaining).toLocaleString()} leads this step (you have ${access.leadsRemaining.toLocaleString()} credits left).`,
      async: true,
      leadsRemaining: access.leadsRemaining,
      batchSize,
      jobRequirements,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Search failed";
    console.error("[leads/find] parse/start failed:", msg);
    await prisma.leadSearch.update({
      where: { id: search.id },
      data: { status: "FAILED", errorMessage: toUserFacingSearchError(msg) },
    });
    throw error;
  }
}

/** Background pull: sequential batches (default 100), one auto-batch per click. */
export async function runFindLeadsJob(
  user: User,
  input: FindLeadsInput,
  searchId: string,
  started: {
    prompt: string;
    parseProvider: string;
    criteria: SearchCriteria;
  }
) {
  const start = Date.now();
  const ignoreContext = shouldIgnoreLeadContext();
  const leadContext = ignoreContext ? null : await getUserLeadContext(user.id);
  const batchSize = getProcessBatchSize();

  const requestedCap =
    input.requestedLeadCount && input.requestedLeadCount > 0
      ? Math.min(input.requestedLeadCount, batchSize)
      : batchSize;

  const access = await requireLeadSearchAccess(user, requestedCap);
  const maxLeadsThisRun = Math.min(batchSize, access.leadsRemaining, requestedCap);

  const { criteria, parseProvider } = started;
  const wantsEmail = Boolean(criteria.requireEmail) || promptAsksForEmail(started.prompt);

  try {
    const { result, pool, charged } = await runSearchStep({
      userId: user.id,
      searchId,
      criteria,
      prompt: started.prompt,
      wantsEmail,
      leadContext,
      startPage: 1,
      seenIds: await userLeadKeys(user.id),
      batchesCompleted: 0,
      leadsFetched: 0,
      leadsWithEmail: 0,
      peoplePulled: 0,
      maxLeadsThisRun,
    });

    await incrementUsage(user.id, charged, 1);

    if (result.stopped && result.leadsWithEmail === 0 && result.leadsFetched === 0) {
      await prisma.leadSearch.update({
        where: { id: searchId },
        data: {
          status: "FAILED",
          errorMessage: USER_STOPPED_MESSAGE,
          totalAvailable: result.totalAvailable,
          leadsReturned: 0,
          durationMs: Date.now() - start,
          relaxNote: "Stopped before any leads were pulled. Edit your prompt and try again.",
        },
      });
      return;
    }

    const partialNote = result.canResume
      ? result.creditsExhausted
        ? OUT_OF_LOOKUPS
        : result.stopReason === "max_auto_batches" || result.stopReason === "credit_cap"
          ? ` Saved this batch. Click Get next 100 when you want more (you asked for more / more matches remain).`
          : result.stopped
            ? " Stopped by you — click Get next 100 to continue."
            : " More matches remain — click Get next 100 to continue."
      : "";

    const verifiedEmailCount = await prisma.lead.count({
      where: { searchId, userId: user.id, deletedAt: null, hasEmail: true },
    });
    const savedTotal = result.leadsWithEmail;
    const countNote =
      savedTotal === 0
        ? criteria.openToWork
          ? `Checked ${(result.otwScanned ?? result.leadsFetched).toLocaleString()} matching people for open-to-work wording; ${result.otwSignalHits ?? 0} had it, but none had a verified email to save.`
          : `Checked ${result.leadsFetched.toLocaleString()} matching people, but none had a verified email. We only save checked emails.`
        : `Saved ${savedTotal.toLocaleString()} lead${savedTotal === 1 ? "" : "s"} (${verifiedEmailCount.toLocaleString()} with a verified email).`;

    const outcomeNote =
      result.totalAvailable === 0 && savedTotal === 0
        ? "No people matched this exact role and location. Try a wider location or more job titles."
        : savedTotal === 0 && result.leadsFetched === 0
          ? "You already have every person who matches this search. Try a wider location or more job titles to find new people."
          : savedTotal === 0 && !wantsEmail
          ? `Checked ${result.leadsFetched.toLocaleString()} matching people, but none had a public LinkedIn profile. Try a wider search.`
          : countNote;

    await prisma.leadSearch.update({
      where: { id: searchId },
      data: {
        status: "COMPLETE",
        errorMessage: null,
        parsedCriteria: criteriaForClient(criteria) as object,
        apolloFilters: withFetchProgress(result.activeFilters, {
          lastPage: result.lastPage,
          totalPages: result.totalPages,
          partial: result.partial,
          canResume: result.canResume,
          peoplePulled: result.peoplePulled,
          savedCount: result.leadsWithEmail,
          batchesCompleted: result.batchesCompleted,
          leadsFetched: result.leadsFetched,
          leadsWithEmail: result.leadsWithEmail,
          emailsUnlockedCount: 0,
          totalToUnlock: result.totalAvailable,
        }) as object,
        totalAvailable: result.totalAvailable,
        leadsReturned: result.leadsWithEmail,
        durationMs: Date.now() - start,
        aiProviderUsed: toDbAiProvider(result.scoreProvider, parseProvider),
        relaxNote: `${outcomeNote}${partialNote}${result.apolloRelaxNote ? ` ${result.apolloRelaxNote}` : ""}`.trim(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Search failed";
    console.error("[leads/find] job failed:", msg);
    await prisma.leadSearch.update({
      where: { id: searchId },
      data: {
        status: "FAILED",
        errorMessage: toUserFacingSearchError(msg),
        durationMs: Date.now() - start,
      },
    });
    throw error;
  }
}

/**
 * Continue a partial Apollo pull from the next incomplete batch (after last completed page).
 */
export async function resumeFindLeadsJob(user: User, searchId: string) {
  assertApolloConfigured();
  const start = Date.now();

  const search = await prisma.leadSearch.findFirst({
    where: { id: searchId, userId: user.id, deletedAt: null },
  });
  if (!search) throw new Error("Search not found");
  if (search.status === "RUNNING") throw new Error("Search is already running");

  const progress = readFetchProgress(search.apolloFilters);
  const resumeFilters = stripFetchProgress(
    search.apolloFilters as unknown as ApolloSearchFilters
  );
  if (!resumeFilters?.personTitles?.length && !resumeFilters?.personLocations?.length) {
    throw new Error("Missing search filters to resume — run a new search.");
  }

  if (!canResumeSearch(search.apolloFilters, search.leadsReturned, search.totalAvailable, search.relaxNote)) {
    throw new Error("This search cannot be resumed (already complete or no progress saved).");
  }

  const startPage = progress ? progress.lastPage + 1 : estimateResumePage(search.leadsReturned);

  const parsed = (search.parsedCriteria || {}) as Record<string, unknown>;
  const criteria: SearchCriteria = {
    industry: (parsed.industry as string) || "Any",
    country: (parsed.country as string) || "United States",
    companySizeMin: (parsed.companySizeMin as number) ?? 1,
    companySizeMax: (parsed.companySizeMax as number) ?? 10000,
    jobTitles: Array.isArray(parsed.jobTitles) ? (parsed.jobTitles as string[]) : resumeFilters.personTitles,
    keywords: resumeFilters.qKeywords,
    summary: (parsed.summary as string) || search.prompt.slice(0, 120),
    searchIntent: (parsed.searchIntent as string) || (parsed.intentSummary as string) || search.prompt,
    openToWork: Boolean(parsed.openToWork),
    requireEmail: Boolean(parsed.requireEmail),
    apollo: resumeFilters,
  };
  const wantsEmail = Boolean(criteria.requireEmail) || promptAsksForEmail(search.prompt);

  await prisma.leadSearch.update({
    where: { id: searchId },
    data: {
      status: "RUNNING",
      errorMessage: null,
      relaxNote: `Getting next batch from page ${startPage}…`,
    },
  });

  const ignoreContext = shouldIgnoreLeadContext();
  const leadContext = ignoreContext ? null : await getUserLeadContext(user.id);

  try {
    const existingIds = await userLeadKeys(user.id);

    const batchSize = getProcessBatchSize();
    const resumeAccess = await requireLeadSearchAccess(user, batchSize);
    const maxLeadsThisRun = Math.min(batchSize, resumeAccess.leadsRemaining);

    const { result, pool, charged } = await runSearchStep({
      userId: user.id,
      searchId,
      criteria,
      prompt: search.prompt,
      wantsEmail,
      leadContext,
      startPage,
      resumeFilters,
      seenIds: existingIds,
      batchesCompleted: progress?.batchesCompleted ?? 0,
      leadsFetched: progress?.leadsFetched ?? progress?.peoplePulled ?? 0,
      leadsWithEmail: progress?.leadsWithEmail ?? search.leadsReturned,
      peoplePulled: progress?.peoplePulled ?? search.leadsReturned,
      totalAvailable: search.totalAvailable,
      maxLeadsThisRun,
    });

    await incrementUsage(user.id, charged, 0);

    const totalSaved = result.leadsWithEmail;
    const partialNote = result.canResume
      ? result.creditsExhausted
        ? OUT_OF_LOOKUPS
        : " Click Get next 100 for more."
      : "";

    await prisma.leadSearch.update({
      where: { id: searchId },
      data: {
        status: "COMPLETE",
        errorMessage: null,
        totalAvailable: result.totalAvailable,
        leadsReturned: totalSaved,
        durationMs: (search.durationMs || 0) + (Date.now() - start),
        aiProviderUsed: toDbAiProvider(result.scoreProvider, search.aiProviderUsed || "HEURISTIC"),
        apolloFilters: withFetchProgress(result.activeFilters, {
          lastPage: result.lastPage,
          totalPages: result.totalPages,
          partial: result.partial,
          canResume: result.canResume,
          peoplePulled: result.peoplePulled,
          savedCount: totalSaved,
          batchesCompleted: result.batchesCompleted,
          leadsFetched: result.leadsFetched,
          leadsWithEmail: totalSaved,
          emailsUnlockedCount: 0,
          totalToUnlock: result.totalAvailable,
        }) as object,
        relaxNote: result.canResume
          ? `Added ${(result.savedThisRun + pool.saved).toLocaleString()} more leads (${totalSaved.toLocaleString()} in total).${partialNote}`
          : `Done: ${totalSaved.toLocaleString()} leads saved for this search.`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Resume failed";
    console.error("[searches/resume] job failed:", msg);
    await prisma.leadSearch.update({
      where: { id: searchId },
      data: {
        status: "FAILED",
        errorMessage: toUserFacingSearchError(msg),
        durationMs: (search.durationMs || 0) + (Date.now() - start),
      },
    });
    throw error;
  }
}

/**
 * Sync path (tests / fallback): start + run in one call, return leads for the chat.
 * Prefer startFindLeadsWorkflow + runFindLeadsJob with `after()` in the API route.
 */
export async function findLeadsWorkflow(user: User, input: FindLeadsInput) {
  const started = await startFindLeadsWorkflow(user, input);
  await runFindLeadsJob(user, input, started.searchId, {
    prompt: started.prompt,
    parseProvider: started.parseProvider,
    criteria: started.rawCriteria,
  });

  const responseLeadLimit = 200;
  const search = await prisma.leadSearch.findUnique({ where: { id: started.searchId } });
  const savedLeads = await prisma.lead.findMany({
    where: { searchId: started.searchId },
    orderBy: { leadScore: "desc" },
    take: responseLeadLimit,
  });

  return {
    searchId: started.searchId,
    leads: savedLeads.map(mapLeadToRecord),
    criteria: started.clientCriteria,
    totalAvailable: search?.totalAvailable ?? savedLeads.length,
    apolloRelaxNote: search?.relaxNote ?? undefined,
    message:
      search?.relaxNote ||
      `Saved ${(search?.leadsReturned ?? savedLeads.length).toLocaleString()} leads for this prompt.`,
    status: search?.status ?? "COMPLETE",
  };
}
