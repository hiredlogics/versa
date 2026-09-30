"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { EmptyLeadState } from "@/components/app/EmptyLeadState";
import { PromptComposer, type ComposerValues } from "@/components/app/PromptComposer";
import { AdvancedFiltersDrawer } from "@/components/app/AdvancedFiltersDrawer";
import { SearchProgress } from "@/components/app/SearchProgress";
import { LeadResultsTable } from "@/components/app/LeadResultsTable";
import { LeadDetailDrawer } from "@/components/app/LeadDetailDrawer";
import { LeadContextBanner } from "@/components/app/LeadContextBanner";
import {
  PlatformStatusBanner,
  providerErrorMessage,
  type PlatformStatus,
} from "@/components/app/PlatformStatusBanner";
import { SearchErrorCard, type SearchErrorKind } from "@/components/app/SearchErrorCard";
import {
  ClarificationCard,
  type ClarificationAnswer,
} from "@/components/app/ClarificationCard";
import type { ClarificationQuestion } from "@/lib/clarifyPrompt";
import type { ParsedSearchCriteria } from "@/lib/validations/search-criteria";
import {
  buildPromptWithFilters,
  type AdvancedFilters,
  type FindLeadsResponse,
  type LeadRecord,
  type SearchStep,
} from "@/lib/types/lead-finder";
import { buildAssistantSummary } from "@/lib/services/searches/searchHistory";
import type { SearchDetailResponse } from "@/lib/types/search-history";
import {
  clearRestoreSearchId,
  markRestoreComplete,
  readPendingRestoreSearchId,
} from "@/lib/search-restore";
import { AUTH_SESSION_CHANGED } from "@/components/auth/AuthSessionSync";
import { useAppShellData } from "@/components/app/AppShellDataProvider";
import { BRAND } from "@/config/brand";

const INITIAL_STEPS: SearchStep[] = [
  { id: "understand", label: BRAND.searchSteps.understand, status: "pending" },
  { id: "extract", label: BRAND.searchSteps.extract, status: "pending" },
  { id: "search", label: BRAND.searchSteps.search, status: "pending" },
  { id: "decision", label: BRAND.searchSteps.decision, status: "pending" },
  { id: "enrich", label: BRAND.searchSteps.enrich, status: "pending" },
  { id: "score", label: BRAND.searchSteps.score, status: "pending" },
  { id: "save", label: BRAND.searchSteps.save, status: "pending" },
];

const STEP_DELAYS_MS = [0, 1800, 4500, 9000, 18000, 30000, 45000];

const EMPTY_CRITERIA: ParsedSearchCriteria = {
  industry: null,
  country: null,
  companySizeMin: null,
  companySizeMax: null,
  jobTitles: [],
  seniorityLevels: [],
  keywords: [],
  companyNames: [],
  companyDomains: [],
  linkedinUrls: [],
  intentSummary: "",
};

type UserTurn = {
  id: string;
  role: "user";
  text: string;
};

type AssistantTurn = {
  id: string;
  role: "assistant";
  summary?: string;
  steps: SearchStep[];
  criteria?: ParsedSearchCriteria;
  result?: FindLeadsResponse;
  error?: { kind: SearchErrorKind; message: string };
  loading?: boolean;
  clarification?: {
    questions: ClarificationQuestion[];
    leadsRemaining?: number;
    batchSize?: number;
  };
};

type ChatTurn = UserTurn | AssistantTurn;

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function classifyError(status: number, message: string, code?: string): SearchErrorKind {
  if (code === "LEAD_LIMIT_REACHED" || code === "SEARCH_LIMIT_REACHED") return "usage_limit";
  if (status === 401) return "unauthorized";
  if (status === 402) return "subscription";
  if (status === 403) return "generic";
  if (status === 429) return "rate_limit";
  if (code === "APOLLO_ERROR" || code === "SEARCH_PROVIDER_ERROR" || /apollo/i.test(message)) return "apollo";
  if (/scor/i.test(message)) return "scoring";
  return "generic";
}

function buildConversationPrompt(
  priorUserTexts: string[],
  nextText: string,
  filters: AdvancedFilters,
  composer: ComposerValues
): string {
  const trimmed = nextText.trim();
  const prior = priorUserTexts.map((line) => line.trim()).filter(Boolean);

  // Merge follow-ups into one clear search brief — never dump "Conversation context" raw into the parser
  let base = trimmed;
  if (prior.length > 0 && trimmed) {
    base = [
      "Lead search request (combine all lines into ONE search):",
      ...prior.map((line, i) => `- Earlier: ${line}`),
      `- Latest refinement: ${trimmed}`,
      "Use the latest refinement to update industry, titles, location, and needs. Keep the full meaning.",
    ].join("\n");
  } else if (prior.length > 0 && !trimmed) {
    base = prior.join(". ");
  }

  return buildPromptWithFilters(base, filters, {
    linkedinUrl: composer.linkedinUrl || undefined,
    companyUrl: composer.companyUrl || undefined,
    companyName: composer.companyName || undefined,
  });
}

export function LeadFinderChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSearchId = searchParams.get("searchId");
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const restoreSearchId = urlSearchId ?? pendingRestoreId;

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [composer, setComposer] = useState<ComposerValues>({
    prompt: "",
    linkedinUrl: "",
    companyUrl: "",
    companyName: "",
  });
  // Default 5 — open-to-work / role searches rarely clear an 8+ buyer score
  const [filters, setFilters] = useState<AdvancedFilters>({ minScore: 5 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<SearchStep[]>(INITIAL_STEPS);
  const [parsedCriteria, setParsedCriteria] = useState<ParsedSearchCriteria | undefined>();
  const [composerError, setComposerError] = useState<{ kind: SearchErrorKind; message: string } | null>(
    null
  );
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<{ kind: SearchErrorKind; message: string } | null>(
    null
  );
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus | null>(null);
  const [editingUserTurnId, setEditingUserTurnId] = useState<string | null>(null);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [resumingSearchId, setResumingSearchId] = useState<string | null>(null);
  const [loadingMoreSearchId, setLoadingMoreSearchId] = useState<string | null>(null);
  // Set once the user has answered clarifying questions — the next run skips the gate.
  const [clarified, setClarified] = useState(false);
  const shellData = useAppShellData();

  useEffect(() => {
    if (!shellData?.platformStatus) return;
    setPlatformStatus({
      apollo: shellData.platformStatus.apollo,
      ai: shellData.platformStatus.ai,
      leadSearchReady: shellData.platformStatus.leadSearchReady,
      isAdmin: shellData.platformStatus.isAdmin,
    });
  }, [shellData]);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedRestoreIdRef = useRef<string | null>(null);
  const activeSearchIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  const inConversation = turns.length > 0;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const clearChatState = useCallback(() => {
    clearTimers();
    stopRequestedRef.current = true;
    activeSearchIdRef.current = null;
    setActiveSearchId(null);
    setEditingUserTurnId(null);
    setLoading(false);
    setTurns([]);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" as const })));
    setParsedCriteria(undefined);
    setComposerError(null);
    setRestoreError(null);
    setSelectedLead(null);
    setComposer({ prompt: "", linkedinUrl: "", companyUrl: "", companyName: "" });
    setPendingRestoreId(null);
    setClarified(false);
    loadedRestoreIdRef.current = null;
    clearRestoreSearchId();
  }, [clearTimers]);

  const stopActiveSearch = useCallback(async () => {
    stopRequestedRef.current = true;
    const id = activeSearchIdRef.current;
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      await fetch(`/api/searches/${id}/stop`, { method: "POST" });
    } catch {
      // Poll loop will still exit via stopRequestedRef
    }
  }, []);

  const beginEditPrompt = useCallback(
    async (userTurnId: string, text: string) => {
      if (loading && activeSearchIdRef.current) {
        await stopActiveSearch();
      }
      setEditingUserTurnId(userTurnId);
      setComposer((prev) => ({ ...prev, prompt: text }));
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    },
    [loading, stopActiveSearch]
  );

  async function pollSearchUntilDone(
    searchId: string,
    assistantTurnId: string,
    fallbackCriteria?: ParsedSearchCriteria
  ) {
    activeSearchIdRef.current = searchId;
    setActiveSearchId(searchId);
    const pollLimitMs = Math.max(
      60_000,
      parseInt(process.env.NEXT_PUBLIC_SEARCH_POLL_MS || String(45 * 60_000), 10)
    );
    const pollStarted = Date.now();
    let lastNote = "";

    while (Date.now() - pollStarted < pollLimitMs) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(`/api/searches/${searchId}?limit=200`);
      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json()) as SearchDetailResponse;
      const { search, leads } = pollData;

      if (search.relaxNote && search.relaxNote !== lastNote) {
        lastNote = search.relaxNote;
        patchAssistantTurn(assistantTurnId, {
          summary: search.relaxNote,
          criteria: search.parsedCriteria ?? fallbackCriteria,
        });
      }

      // Progressive: show leads as each 1,000-batch saves (don't wait for COMPLETE)
      if (search.status === "RUNNING" && leads.length > 0) {
        const partial: FindLeadsResponse = {
          searchId: search.id,
          leads,
          criteria: search.parsedCriteria ?? fallbackCriteria ?? EMPTY_CRITERIA,
          totalAvailable: search.totalFound,
          totalSaved: search.totalQualified,
          leadsOffset: search.leadsOffset ?? 0,
          apolloRelaxNote: search.relaxNote ?? undefined,
          message: search.relaxNote || "Processing batches…",
          status: "RUNNING",
          canResume: false,
        };
        patchAssistantTurn(assistantTurnId, {
          loading: true,
          criteria: partial.criteria,
          summary: search.relaxNote || lastNote,
          result: partial,
        });
      }

      if (search.status === "FAILED") {
        const stopped = /stopped by user/i.test(search.errorMessage || "");
        finishSearchTurn(assistantTurnId, false, {
          loading: false,
          criteria: search.parsedCriteria ?? fallbackCriteria,
          error: {
            kind: stopped ? "empty" : "generic",
            message: stopped
              ? "Search stopped. Edit your prompt below and run again."
              : search.errorMessage || "Search failed while pulling leads.",
          },
        });
        return;
      }

      if (search.status === "COMPLETE") {
        const result: FindLeadsResponse = {
          searchId: search.id,
          leads,
          criteria: search.parsedCriteria ?? fallbackCriteria ?? EMPTY_CRITERIA,
          totalAvailable: search.totalFound,
          totalSaved: search.totalQualified,
          leadsOffset: search.leadsOffset ?? 0,
          apolloRelaxNote: search.relaxNote ?? undefined,
          message:
            search.relaxNote ||
            `Saved ${search.totalQualified.toLocaleString()} leads for this prompt.`,
          status: "COMPLETE",
          canResume: Boolean(search.canResume),
        };

        const summary = buildAssistantSummary(
          search.parsedCriteria ?? fallbackCriteria ?? null,
          search.totalQualified,
          search.totalFound
        );

        if (search.totalQualified === 0) {
          finishSearchTurn(assistantTurnId, true, {
            loading: false,
            criteria: result.criteria,
            summary,
            error: {
              kind: "empty",
              message: result.message || "No leads matched your criteria.",
            },
          });
          return;
        }

        finishSearchTurn(assistantTurnId, true, {
          loading: false,
          criteria: result.criteria,
          summary,
          result,
        });
        loadedRestoreIdRef.current = searchId;

        return;
      }
    }

    finishSearchTurn(assistantTurnId, false, {
      loading: false,
      criteria: fallbackCriteria,
      error: {
        kind: "still_running",
        message:
          "Still processing lead batches in the background. Open Searches in a few minutes — saved leads appear after each batch of 1,000.",
      },
    });
  }

  async function handleResumeSearch(assistantTurnId: string, searchId: string) {
    setResumingSearchId(searchId);
    stopRequestedRef.current = false;
    setLoading(true);
    patchAssistantTurn(assistantTurnId, {
      loading: true,
      summary: "Getting the next 100 leads…",
      error: undefined,
    });
    startStepAnimation();

    try {
      const res = await fetch(`/api/searches/${searchId}/resume`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        finishSearchTurn(assistantTurnId, false, {
          loading: false,
          error: {
            kind: "generic",
            message: data.error || "Could not resume this search.",
          },
        });
        return;
      }
      await pollSearchUntilDone(searchId, assistantTurnId);
    } catch {
      finishSearchTurn(assistantTurnId, false, {
        loading: false,
        error: {
          kind: "network",
          message: "Could not reach the server to resume.",
        },
      });
    } finally {
      setResumingSearchId(null);
      activeSearchIdRef.current = null;
      setActiveSearchId(null);
      setLoading(false);
    }
  }

  async function handleLeadsPage(
    assistantTurnId: string,
    searchId: string,
    nextOffset: number
  ) {
    setLoadingMoreSearchId(searchId);
    try {
      // Unlock emails + Why for this visible batch of 200
      const enrichRes = await fetch(`/api/searches/${searchId}/enrich-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: Math.max(0, nextOffset), limit: 200 }),
      });
      const enrichedBody = enrichRes.ok
        ? ((await enrichRes.json()) as { leads?: FindLeadsResponse["leads"] })
        : null;

      const res = await fetch(
        `/api/searches/${searchId}?limit=200&offset=${Math.max(0, nextOffset)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as SearchDetailResponse;
      patchAssistantTurn(assistantTurnId, {
        result: {
          searchId,
          leads: enrichedBody?.leads?.length ? enrichedBody.leads : data.leads,
          criteria: data.search.parsedCriteria ?? EMPTY_CRITERIA,
          totalAvailable: data.search.totalFound,
          totalSaved: data.search.totalQualified,
          leadsOffset: data.search.leadsOffset ?? nextOffset,
          apolloRelaxNote: data.search.relaxNote ?? undefined,
          message:
            data.search.relaxNote ||
            `Saved ${data.search.totalQualified.toLocaleString()} leads for this prompt.`,
          canResume: Boolean(data.search.canResume),
          status: data.search.status,
        },
      });
    } finally {
      setLoadingMoreSearchId(null);
    }
  }

  const resetSearch = useCallback(() => {
    clearChatState();
    router.replace("/app");
  }, [clearChatState, router]);

  const patchAssistantTurn = useCallback((assistantId: string, patch: Partial<AssistantTurn>) => {
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === assistantId && turn.role === "assistant" ? { ...turn, ...patch } : turn
      )
    );
  }, []);

  useEffect(() => {
    const handler = () => resetSearch();
    window.addEventListener("leadfinder:new-search", handler);
    return () => window.removeEventListener("leadfinder:new-search", handler);
  }, [resetSearch]);

  useEffect(() => {
    const handler = () => clearChatState();
    window.addEventListener(AUTH_SESSION_CHANGED, handler);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED, handler);
  }, [clearChatState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading, steps, parsedCriteria, restoring]);

  useEffect(() => {
    const storedId = readPendingRestoreSearchId();
    if (storedId) setPendingRestoreId(storedId);
  }, []);

  useEffect(() => {
    if (!restoreSearchId) return;
    if (loadedRestoreIdRef.current === restoreSearchId) return;

    let cancelled = false;
    const controller = new AbortController();
    const searchIdToRestore = restoreSearchId;
    const hadUrlSearchId = Boolean(urlSearchId);

    setTurns([]);
    setRestoring(true);
    setRestoreError(null);

    fetch(`/api/searches/${encodeURIComponent(searchIdToRestore)}?limit=200&offset=0`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.status === 401) throw new Error("Unauthorized");
        if (!r.ok) throw new Error("Not found");
        return r.json() as Promise<SearchDetailResponse>;
      })
      .then((data) => {
        if (cancelled) return;

        const { search, leads } = data;
        const criteria = search.parsedCriteria ?? EMPTY_CRITERIA;
        const result: FindLeadsResponse = {
          searchId: search.id,
          leads,
          criteria,
          totalAvailable: search.totalFound,
          totalSaved: search.totalQualified,
          leadsOffset: search.leadsOffset ?? 0,
          message: `${search.totalQualified.toLocaleString()} leads restored from search history.`,
          canResume: Boolean(search.canResume),
        };

        loadedRestoreIdRef.current = searchIdToRestore;
        setTurns([
          { id: newId(), role: "user", text: search.prompt },
          {
            id: newId(),
            role: "assistant",
            summary: buildAssistantSummary(criteria, search.totalQualified, search.totalFound),
            steps: INITIAL_STEPS.map((s) => ({ ...s, status: "complete" as const })),
            criteria,
            result,
            loading: false,
          },
        ]);

        markRestoreComplete();
        clearRestoreSearchId();
        setPendingRestoreId(null);
        setRestoring(false);
        if (hadUrlSearchId) router.replace("/app");
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;

        loadedRestoreIdRef.current = null;
        clearRestoreSearchId();
        setPendingRestoreId(null);
        setRestoring(false);
        if (hadUrlSearchId) router.replace("/app");
        setRestoreError({
          kind: "generic",
          message: "Could not restore this search. It may have been removed or belongs to another account.",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
      setRestoring(false);
    };
  }, [restoreSearchId, router]);

  function startStepAnimation() {
    clearTimers();
    const running = INITIAL_STEPS.map((s, i) => ({ ...s, status: i === 0 ? ("running" as const) : ("pending" as const) }));
    setSteps(running);

    STEP_DELAYS_MS.forEach((delay, index) => {
      if (index === 0) return;
      const t = setTimeout(() => {
        setSteps((prev) =>
          prev.map((step, i) => {
            if (i < index) return { ...step, status: "complete" };
            if (i === index) return { ...step, status: "running" };
            return step;
          })
        );
      }, delay);
      timersRef.current.push(t);
    });
  }

  function finishSearchTurn(
    assistantTurnId: string,
    success: boolean,
    patch: Partial<Omit<AssistantTurn, "id" | "role">>
  ) {
    clearTimers();
    setSteps((prev) => {
      const finalSteps = prev.map((step, i) => ({
        ...step,
        status: success ? ("complete" as const) : i < prev.length - 1 ? ("complete" as const) : ("failed" as const),
      }));
      patchAssistantTurn(assistantTurnId, { ...patch, steps: finalSteps });
      return finalSteps;
    });
  }

  /** Answers from the question card become the next chat turn and start the search. */
  function answerClarification(assistantTurnId: string, answer: ClarificationAnswer) {
    patchAssistantTurn(assistantTurnId, { clarification: undefined });
    void runSearch(undefined, {
      prompt: answer.text,
      requestedLeadCount: answer.requestedLeadCount,
    });
  }

  async function runSearch(
    retryAssistantTurnId?: string,
    override?: { prompt: string; requestedLeadCount?: number }
  ) {
    const isRetry = typeof retryAssistantTurnId === "string" && retryAssistantTurnId.length > 0;

    if (platformStatus && !platformStatus.leadSearchReady) {
      setComposerError({
        kind: "apollo",
        message: providerErrorMessage(platformStatus.isAdmin),
      });
      return;
    }

    let snapshot: ComposerValues;
    let priorUserTexts: string[];
    let displayText: string;
    let assistantTurnId: string;

    if (isRetry) {
      const assistantIndex = turns.findIndex((turn) => turn.id === retryAssistantTurnId);
      if (assistantIndex <= 0) return;

      const userTurn = turns[assistantIndex - 1];
      if (userTurn.role !== "user") return;

      displayText = userTurn.text;
      snapshot = { prompt: displayText, linkedinUrl: "", companyUrl: "", companyName: "" };
      priorUserTexts = turns
        .slice(0, assistantIndex - 1)
        .filter((turn): turn is UserTurn => turn.role === "user")
        .map((turn) => turn.text);
      assistantTurnId = retryAssistantTurnId;
    } else if (editingUserTurnId) {
      snapshot = { ...composer };
      const hasInput =
        snapshot.prompt.trim() ||
        snapshot.linkedinUrl ||
        snapshot.companyUrl ||
        snapshot.companyName;

      if (!hasInput) {
        setComposerError({
          kind: "missing_prompt",
          message: "Describe who you want to find or add a URL.",
        });
        return;
      }

      displayText =
        snapshot.prompt.trim() ||
        snapshot.linkedinUrl ||
        snapshot.companyUrl ||
        snapshot.companyName;

      const editId = editingUserTurnId;
      const editIndex = turns.findIndex((turn) => turn.id === editId);
      if (editIndex < 0) {
        setEditingUserTurnId(null);
        return;
      }

      priorUserTexts = turns
        .slice(0, editIndex)
        .filter((turn): turn is UserTurn => turn.role === "user")
        .map((turn) => turn.text);

      assistantTurnId = newId();

      setTurns((prev) => {
        const idx = prev.findIndex((turn) => turn.id === editId);
        if (idx < 0) return prev;
        const kept = prev.slice(0, idx);
        return [
          ...kept,
          { id: editId, role: "user" as const, text: displayText },
          {
            id: assistantTurnId,
            role: "assistant" as const,
            loading: true,
            steps: INITIAL_STEPS.map((s, i) => ({
              ...s,
              status: i === 0 ? ("running" as const) : ("pending" as const),
            })),
          },
        ];
      });

      setEditingUserTurnId(null);
      setComposer({ prompt: "", linkedinUrl: "", companyUrl: "", companyName: "" });
    } else {
      snapshot = override ? { ...composer, prompt: override.prompt } : { ...composer };
      const hasInput =
        snapshot.prompt.trim() ||
        snapshot.linkedinUrl ||
        snapshot.companyUrl ||
        snapshot.companyName;

      if (!hasInput) {
        setComposerError({
          kind: "missing_prompt",
          message: "Describe who you want to find or add a URL.",
        });
        return;
      }

      priorUserTexts = turns.filter((turn): turn is UserTurn => turn.role === "user").map((turn) => turn.text);
      displayText =
        snapshot.prompt.trim() ||
        snapshot.linkedinUrl ||
        snapshot.companyUrl ||
        snapshot.companyName;

      const userTurnId = newId();
      assistantTurnId = newId();

      setTurns((prev) => [
        ...prev,
        { id: userTurnId, role: "user", text: displayText },
        {
          id: assistantTurnId,
          role: "assistant",
          loading: true,
          steps: INITIAL_STEPS.map((s, i) => ({
            ...s,
            status: i === 0 ? ("running" as const) : ("pending" as const),
          })),
        },
      ]);

      setComposer({ prompt: "", linkedinUrl: "", companyUrl: "", companyName: "" });
    }

    const fullPrompt = buildConversationPrompt(priorUserTexts, snapshot.prompt, filters, snapshot);

    setComposerError(null);
    setRestoreError(null);
    stopRequestedRef.current = false;
    setLoading(true);
    setParsedCriteria(undefined);
    clearRestoreSearchId();
    setPendingRestoreId(null);
    if (urlSearchId) router.replace("/app");

    if (isRetry) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantTurnId && turn.role === "assistant"
            ? {
                ...turn,
                loading: true,
                error: undefined,
                summary: undefined,
                result: undefined,
                criteria: undefined,
                steps: INITIAL_STEPS.map((s, i) => ({
                  ...s,
                  status: i === 0 ? ("running" as const) : ("pending" as const),
                })),
              }
            : turn
        )
      );
    }

    startStepAnimation();

    let inputType: "prompt" | "linkedin" | "company_url" | "company_name" = "prompt";
    if (snapshot.linkedinUrl) inputType = "linkedin";
    else if (snapshot.companyUrl) inputType = "company_url";
    else if (snapshot.companyName) inputType = "company_name";

    try {
      const res = await fetch("/api/leads/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          linkedinUrl: snapshot.linkedinUrl || undefined,
          companyUrl: snapshot.companyUrl || undefined,
          companyName: snapshot.companyName || undefined,
          inputType,
          minScore: filters.minScore ?? 5,
          skipClarification: clarified || undefined,
          requestedLeadCount: override?.requestedLeadCount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.redirect === "/onboarding") {
          window.location.href = "/onboarding";
          return;
        }
        finishSearchTurn(assistantTurnId, false, {
          loading: false,
          error: {
            kind: classifyError(res.status, data.error || "", data.code),
            message:
              data.code === "SEARCH_PROVIDER_ERROR"
                ? providerErrorMessage(platformStatus?.isAdmin)
                : data.error || "Search failed. Please try again.",
          },
        });
        return;
      }

      const response = data as FindLeadsResponse;
      setParsedCriteria(response.criteria);

      // Ask before spending credits: no search row was created yet.
      if (response.status === "NEEDS_CLARIFICATION" || (response.questions?.length ?? 0) > 0) {
        clearTimers();
        setClarified(true);
        const pendingSteps = INITIAL_STEPS.map((s) => ({ ...s, status: "pending" as const }));
        setSteps(pendingSteps);
        patchAssistantTurn(assistantTurnId, {
          loading: false,
          criteria: response.criteria,
          summary: response.message,
          steps: pendingSteps,
          clarification: {
            questions: response.questions ?? [],
            leadsRemaining: response.leadsRemaining,
            batchSize: response.batchSize,
          },
        });
        return;
      }

      // Async full-pull: poll until COMPLETE/FAILED while showing live progress
      if (response.async || response.status === "RUNNING") {
        const searchId = response.searchId;
        patchAssistantTurn(assistantTurnId, {
          summary: response.message,
          criteria: response.criteria,
        });
        await pollSearchUntilDone(searchId, assistantTurnId, response.criteria);
        return;
      }

      const summary = buildAssistantSummary(
        response.criteria ?? null,
        response.leads.length,
        response.totalAvailable ?? response.leads.length
      );

      if (response.leads.length === 0) {
        finishSearchTurn(assistantTurnId, true, {
          loading: false,
          criteria: response.criteria,
          summary,
          error: {
            kind: "empty",
            message: response.message || "No leads matched your criteria. Try broadening your search.",
          },
        });
        return;
      }

      finishSearchTurn(assistantTurnId, true, {
        loading: false,
        criteria: response.criteria,
        summary,
        result: response,
      });
      loadedRestoreIdRef.current = response.searchId;
    } catch {
      finishSearchTurn(assistantTurnId, false, {
        loading: false,
        error: {
          kind: "network",
          message: "Could not reach the server. Check your connection and try again.",
        },
      });
    } finally {
      activeSearchIdRef.current = null;
      setActiveSearchId(null);
      setLoading(false);
    }
  }

  const showEmpty = !inConversation && !loading && !restoring && !restoreSearchId;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          {showEmpty && <EmptyLeadState />}

          {restoring && !inConversation && (
            <div className="app-panel rounded-xl p-6 text-center">
              <p className="text-sm text-lp-muted">Restoring search conversation…</p>
            </div>
          )}

          {restoreError && (
            <SearchErrorCard kind={restoreError.kind} message={restoreError.message} />
          )}

          <PlatformStatusBanner status={platformStatus} />

          {turns.map((turn) => {
            if (turn.role === "user") {
              const isEditing = editingUserTurnId === turn.id;
              return (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="ml-auto max-w-[92%] rounded-xl border border-lp-border-strong bg-lp-panel-strong px-4 py-3 sm:max-w-[85%]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-lp-muted-dark">
                      You{isEditing ? " · editing" : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => beginEditPrompt(turn.id, turn.text)}
                      disabled={restoring}
                      className="text-[11px] font-medium text-lp-muted transition-colors hover:text-lp-ice-blue disabled:opacity-40"
                    >
                      Edit prompt
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-lp-off-white">{turn.text}</p>
                </motion.div>
              );
            }

            const stepState = turn.loading ? steps : turn.steps;
            const criteriaState = turn.loading ? parsedCriteria : turn.criteria;
            const showProgress =
              !turn.error &&
              !turn.clarification &&
              (turn.loading || stepState.some((s) => s.status !== "pending"));

            return (
              <div key={turn.id} className="flex flex-col gap-4">
                {turn.summary && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="app-panel max-w-[92%] rounded-xl p-4 sm:max-w-[85%]"
                  >
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-lp-muted-dark">
                      {BRAND.name}
                    </p>
                    <p className="text-sm leading-relaxed text-lp-muted">{turn.summary}</p>
                  </motion.div>
                )}

                {turn.clarification && turn.clarification.questions.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <ClarificationCard
                      questions={turn.clarification.questions}
                      leadsRemaining={turn.clarification.leadsRemaining}
                      batchSize={turn.clarification.batchSize}
                      disabled={loading}
                      onSubmit={(answer) => answerClarification(turn.id, answer)}
                    />
                  </motion.div>
                )}

                {showProgress && (
                  <SearchProgress
                    steps={stepState}
                    criteria={criteriaState}
                    active={Boolean(turn.loading)}
                  />
                )}

                {turn.error && (
                  <SearchErrorCard
                    kind={turn.error.kind}
                    message={turn.error.message}
                    onRetry={
                      !loading &&
                      turn.error.kind !== "missing_prompt" &&
                      turn.error.kind !== "unauthorized" &&
                      turn.error.kind !== "usage_limit" &&
                      turn.error.kind !== "subscription" &&
                      platformStatus?.leadSearchReady !== false
                        ? () => runSearch(turn.id)
                        : undefined
                    }
                  />
                )}

                {turn.result && (turn.result.leads.length > 0 || (turn.result.totalSaved ?? 0) > 0) && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    {turn.result.apolloRelaxNote && (
                      <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
                        {turn.result.apolloRelaxNote}
                      </p>
                    )}
                    <LeadResultsTable
                      leads={turn.result.leads}
                      searchId={turn.result.searchId}
                      message={turn.result.message}
                      onSelectLead={setSelectedLead}
                      minScoreFilter={0}
                      totalSaved={turn.result.totalSaved ?? turn.result.leads.length}
                      pageOffset={turn.result.leadsOffset ?? 0}
                      canResume={Boolean(turn.result.canResume)}
                      resuming={resumingSearchId === turn.result.searchId}
                      loadingPage={loadingMoreSearchId === turn.result.searchId}
                      onResume={() => handleResumeSearch(turn.id, turn.result!.searchId)}
                      onPageChange={(nextOffset) =>
                        handleLeadsPage(turn.id, turn.result!.searchId, nextOffset)
                      }
                    />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-lp-border bg-lp-black/90 px-4 py-4 backdrop-blur-xl md:px-6">
        <div className="mx-auto w-full max-w-4xl space-y-3">
          <LeadContextBanner />
          {composerError && (
            <SearchErrorCard kind={composerError.kind} message={composerError.message} />
          )}
          <PromptComposer
            values={composer}
            onChange={setComposer}
            onSubmit={() => runSearch()}
            onOpenFilters={() => setFiltersOpen(true)}
            onStop={activeSearchId || loading ? () => void stopActiveSearch() : undefined}
            loading={loading}
            editing={Boolean(editingUserTurnId)}
            disabled={platformStatus?.leadSearchReady === false}
            placeholder={
              editingUserTurnId
                ? "Edit your prompt, then run again…"
                : inConversation
                  ? "Continue in this chat — e.g. “Only founders in Canada” or “Add healthcare companies”"
                  : undefined
            }
            submitLabel={
              editingUserTurnId
                ? "Run edited prompt"
                : inConversation
                  ? "Continue search"
                  : "Find leads"
            }
          />
          {editingUserTurnId && !loading && (
            <button
              type="button"
              onClick={() => {
                setEditingUserTurnId(null);
                setComposer({ prompt: "", linkedinUrl: "", companyUrl: "", companyName: "" });
              }}
              className="text-xs text-lp-muted hover:text-lp-ice-blue"
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <AdvancedFiltersDrawer
        open={filtersOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
        onApply={() => setFiltersOpen(false)}
      />

      <LeadDetailDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
