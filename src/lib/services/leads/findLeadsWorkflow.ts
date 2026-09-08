import { prisma } from "@/lib/db/prisma";
import {
  APOLLO_HARD_MAX_RECORDS,
  getApolloSearchConfig,
  getLeadSearchConfig,
  shouldIgnoreLeadContext,
} from "@/lib/apollo-config";
import { runSequentialLeadBatches } from "@/lib/services/leads/processLeadBatches";
import { assertApolloConfigured } from "@/lib/platform-readiness";
import { parsePromptWithAi } from "@/lib/services/ai/parsePrompt";
import {
  incrementUsage,
  requireLeadSearchAccess,
} from "@/lib/services/billing/usageLimits";
import { mapLeadToRecord } from "@/lib/services/searches/searchHistory";
import { getUserLeadContext } from "@/lib/context/userLeadContext";
import { buildScoringContextFromLeadContext } from "@/lib/context/exclusions";
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
import type { User, AiProvider } from "@prisma/client";
import type { SearchCriteria, ApolloSearchFilters } from "@/lib/types";

export { USER_STOPPED_MESSAGE, canResumeSearch };

export interface FindLeadsInput {
  prompt: string;
  inputType?: string;
  linkedinUrl?: string;
  companyUrl?: string;
  companyName?: string;
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

function buildPrompt(input: FindLeadsInput): string {
  if (input.linkedinUrl) {
    return `Find leads similar to this LinkedIn profile: ${input.linkedinUrl}. ${input.prompt || ""}`.trim();
  }
  if (input.companyUrl) {
    return `Find decision makers at companies like ${input.companyUrl}. ${input.prompt || ""}`.trim();
  }
  if (input.companyName) {
    return `Find decision makers at ${input.companyName}. ${input.prompt || ""}`.trim();
  }
  return input.prompt;
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
    : criteria.summary || criteria.searchIntent?.slice(0, 160) || "";

  return {
    industry: criteria.industry ?? null,
    country: criteria.country ?? null,
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
}> {
  assertApolloConfigured();
  const prompt = buildPrompt(input);
  const ignoreContext = shouldIgnoreLeadContext();
  const leadContext = ignoreContext ? null : await getUserLeadContext(user.id);

  const access = await requireLeadSearchAccess(user, input.requestedLeadCount);
  const { criteria, provider: parseProvider } = await parsePromptWithAi(prompt, {
    userId: user.id,
    leadContext,
  });

  const fromPrompt = extractRequestedLeadCount(prompt);
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
}> {
  assertApolloConfigured();

  const prompt = buildPrompt(input);
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
    },
  });

  try {
    const { criteria, provider: parseProvider, parseMode } = await parsePromptWithAi(prompt, {
      userId: user.id,
      searchId: search.id,
      leadContext,
    });

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

  try {
    const scoreContext = buildScoringContextFromLeadContext(
      leadContext,
      {
        searchIntent: criteria.searchIntent,
        keywords: criteria.keywords,
        excludedTitles: criteria.excludedTitles,
        excludedIndustries: criteria.excludedIndustries,
      },
      started.prompt
    );
    scoreContext.openToWork = criteria.openToWork;
    scoreContext.requireEmail = criteria.requireEmail;
    if (ignoreContext) scoreContext.leadContext = null;

    const result = await runSequentialLeadBatches({
      userId: user.id,
      searchId,
      criteria,
      prompt: started.prompt,
      scoreContext,
      startPage: 1,
      seenIds: new Set(),
      batchesCompleted: 0,
      leadsFetched: 0,
      leadsWithEmail: 0,
      peoplePulled: 0,
      maxLeadsThisRun,
      wasStopped: () => wasStoppedByUser(searchId),
    });

    await incrementUsage(user.id, result.savedThisRun, 1);

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
        ? " Data-provider credits ran out — top up, then click Get next 100."
        : result.stopReason === "max_auto_batches" || result.stopReason === "credit_cap"
          ? ` Saved this batch. Click Get next 100 when you want more (you asked for more / more matches remain).`
          : result.stopped
            ? " Stopped by you — click Get next 100 to continue."
            : " More matches remain — click Get next 100 to continue."
      : "";

    const countNote =
      result.leadsWithEmail === 0
        ? criteria.openToWork
          ? (result.otwSignalHits ?? 0) > 0
            ? `Found ${result.otwSignalHits} profile(s) with open-to-work wording after scanning ${(result.otwScanned ?? result.leadsFetched).toLocaleString()} (pool ≈ ${result.totalAvailable.toLocaleString()}), but none had a verified email to save.`
            : `Scanned ${(result.otwScanned ?? result.leadsFetched).toLocaleString()} profiles (pool ≈ ${result.totalAvailable.toLocaleString()}) for open-to-work title/headline signals — ${result.otwSignalHits ?? 0} matched.`
          : `Checked ${result.leadsFetched.toLocaleString()} matches (pool ≈ ${result.totalAvailable.toLocaleString()}) but none had a verified email — only guessed addresses, which we skip.`
        : `Saved ${result.leadsWithEmail.toLocaleString()} leads with a verified email after checking ${result.leadsFetched.toLocaleString()} / ${result.totalAvailable.toLocaleString()} matches.`;

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
          emailsUnlockedCount: result.leadsWithEmail,
          totalToUnlock: result.totalAvailable,
        }) as object,
        totalAvailable: result.totalAvailable,
        leadsReturned: result.leadsWithEmail,
        durationMs: Date.now() - start,
        aiProviderUsed: toDbAiProvider(result.scoreProvider, parseProvider),
        relaxNote: `${countNote}${partialNote}${result.apolloRelaxNote ? ` ${result.apolloRelaxNote}` : ""}`.trim(),
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
    apollo: resumeFilters,
  };

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
    const existingIds = new Set(
      (
        await prisma.lead.findMany({
          where: { searchId, deletedAt: null, apolloPersonId: { not: null } },
          select: { apolloPersonId: true },
        })
      )
        .map((l) => l.apolloPersonId)
        .filter((id): id is string => Boolean(id))
    );

    const scoreContext = buildScoringContextFromLeadContext(
      leadContext,
      {
        searchIntent: criteria.searchIntent,
        keywords: criteria.keywords,
        excludedTitles: criteria.excludedTitles,
        excludedIndustries: criteria.excludedIndustries,
      },
      search.prompt
    );
    scoreContext.openToWork = criteria.openToWork;
    if (ignoreContext) scoreContext.leadContext = null;

    const batchSize = getProcessBatchSize();
    const resumeAccess = await requireLeadSearchAccess(user, batchSize);
    const maxLeadsThisRun = Math.min(batchSize, resumeAccess.leadsRemaining);

    const result = await runSequentialLeadBatches({
      userId: user.id,
      searchId,
      criteria,
      prompt: search.prompt,
      scoreContext,
      startPage,
      resumeFilters,
      seenIds: existingIds,
      batchesCompleted: progress?.batchesCompleted ?? 0,
      leadsFetched: progress?.leadsFetched ?? progress?.peoplePulled ?? 0,
      leadsWithEmail: progress?.leadsWithEmail ?? search.leadsReturned,
      peoplePulled: progress?.peoplePulled ?? search.leadsReturned,
      maxLeadsThisRun,
      wasStopped: () => wasStoppedByUser(searchId),
    });

    await incrementUsage(user.id, result.savedThisRun, 0);

    const totalSaved = result.leadsWithEmail;
    const partialNote = result.canResume
      ? result.creditsExhausted
        ? " Provider credits ran out — top up, then click Get next 100."
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
          emailsUnlockedCount: totalSaved,
          totalToUnlock: result.totalAvailable,
        }) as object,
        relaxNote: result.canResume
          ? `Resume added ${result.savedThisRun.toLocaleString()} with email (total ${totalSaved.toLocaleString()} after ${result.leadsFetched.toLocaleString()} checked).${partialNote}`
          : `Resume finished — ${totalSaved.toLocaleString()} leads with usable email saved for this prompt.`,
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
