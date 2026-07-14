"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { EmptyLeadState } from "@/components/app/EmptyLeadState";
import { PromptComposer, type ComposerValues } from "@/components/app/PromptComposer";
import { PresetFilterChips } from "@/components/app/PresetFilterChips";
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

  // Merge follow-ups into one clear search brief — never dump "Conversation context" raw into Apollo parse
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
  const [filters, setFilters] = useState<AdvancedFilters>({ minScore: 8 });
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

  const inConversation = turns.length > 0;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const clearChatState = useCallback(() => {
    clearTimers();
    setLoading(false);
    setTurns([]);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" as const })));
    setParsedCriteria(undefined);
    setComposerError(null);
    setRestoreError(null);
    setSelectedLead(null);
    setComposer({ prompt: "", linkedinUrl: "", companyUrl: "", companyName: "" });
    setPendingRestoreId(null);
    loadedRestoreIdRef.current = null;
    clearRestoreSearchId();
  }, [clearTimers]);

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

    fetch(`/api/searches/${encodeURIComponent(searchIdToRestore)}`, {
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
          apolloRelaxNote: search.relaxNote ?? undefined,
          message: `${search.totalQualified} qualified leads restored from search history.`,
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

  async function runSearch(retryAssistantTurnId?: string) {
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
    } else {
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
          minScore: filters.minScore ?? 8,
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
      setLoading(false);
    }
  }

  function appendChip(text: string) {
    setComposer((prev) => ({
      ...prev,
      prompt: prev.prompt.trim() ? `${prev.prompt.trim()}, ${text}` : text,
    }));
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
              return (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="ml-auto max-w-[92%] rounded-xl border border-lp-border-strong bg-lp-panel-strong px-4 py-3 sm:max-w-[85%]"
                >
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-lp-muted-dark">
                    You
                  </p>
                  <p className="text-sm leading-relaxed text-lp-off-white">{turn.text}</p>
                </motion.div>
              );
            }

            const stepState = turn.loading ? steps : turn.steps;
            const criteriaState = turn.loading ? parsedCriteria : turn.criteria;
            const showProgress =
              !turn.error && (turn.loading || stepState.some((s) => s.status !== "pending"));

            return (
              <div key={turn.id} className="flex flex-col gap-4">
                {turn.summary && !turn.loading && (
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

                {turn.result && turn.result.leads.length > 0 && (
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
                      minScoreFilter={filters.minScore ?? 8}
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
          <PresetFilterChips onSelect={appendChip} disabled={loading} />
          <PromptComposer
            values={composer}
            onChange={setComposer}
            onSubmit={() => runSearch()}
            onOpenFilters={() => setFiltersOpen(true)}
            loading={loading}
            disabled={platformStatus?.leadSearchReady === false}
            placeholder={
              inConversation
                ? "Continue in this chat — e.g. “Only founders in Canada” or “Add healthcare companies”"
                : undefined
            }
            submitLabel={inConversation ? "Continue search" : "Find leads"}
          />
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
