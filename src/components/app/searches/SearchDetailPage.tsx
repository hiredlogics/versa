"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SearchStatusBadge } from "@/components/app/searches/SearchStatusBadge";
import { SearchCriteriaSummary } from "@/components/app/searches/SearchCriteriaSummary";
import { SearchTimeline } from "@/components/app/searches/SearchTimeline";
import { SearchMetric } from "@/components/app/searches/SearchMetric";
import { OpenSearchChatButton } from "@/components/app/searches/OpenSearchChatButton";
import { LeadResultsTable } from "@/components/app/LeadResultsTable";
import { LeadDetailDrawer } from "@/components/app/LeadDetailDrawer";
import { ExportButtons } from "@/components/app/ExportButtons";
import { buildAssistantSummary } from "@/lib/services/searches/searchHistory";
import type { SearchDetailResponse } from "@/lib/types/search-history";
import type { LeadRecord } from "@/lib/types/lead-finder";
import { BRAND } from "@/config/brand";
import { SearchHistorySkeleton } from "@/components/app/searches/SearchHistoryStates";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null) {
  if (ms == null) return "None";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SearchDetailResponse | null>(null);
  const [error, setError] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(false);
    fetch(`/api/searches/${id}?limit=200&offset=0`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6">
        <h1 className="text-lg font-semibold text-lp-white">Search not found</h1>
        <p className="mt-2 text-sm text-lp-muted">This search may have been removed or is unavailable.</p>
        <Link href="/app/searches" className="app-link mt-4 inline-block text-sm">
          Back to search history
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <SearchHistorySkeleton />
      </div>
    );
  }

  const { search, leads } = data;
  const summary = buildAssistantSummary(
    search.parsedCriteria,
    search.totalQualified,
    search.totalFound
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8"
    >
      <Link
        href="/app/searches"
        className="mb-6 inline-flex items-center gap-2 text-sm text-lp-muted transition-colors hover:text-lp-off-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to search history
      </Link>

      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-lp-white">Search results</h1>
          <SearchStatusBadge status={search.displayStatus} />
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-lp-muted">{search.prompt}</p>
        <p className="mt-2 text-xs text-lp-muted-dark">{formatDate(search.createdAt)}</p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <OpenSearchChatButton
          searchId={search.id}
          className="border-0 bg-lp-white text-lp-black hover:opacity-90"
        />
        <OpenSearchChatButton
          searchId={search.id}
          refine
          label="Refine search"
          showIcon={false}
        />
        {search.canResume && (
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/searches/${search.id}/resume`, { method: "POST" });
              if (res.ok) window.location.href = `/app?searchId=${search.id}`;
              else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || "Could not resume");
              }
            }}
            className="rounded-xl border border-lp-border bg-lp-panel px-4 py-2 text-sm text-lp-off-white hover:bg-lp-panel-strong"
          >
            Get next 100
          </button>
        )}
        <ExportButtons searchId={search.id} />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SearchMetric label="Match pool" value={search.totalFound.toLocaleString()} />
        <SearchMetric label="Saved leads" value={search.totalQualified.toLocaleString()} />
        <SearchMetric
          label="Avg score"
          value={search.averageScore != null ? String(search.averageScore) : "None"}
        />
        <SearchMetric label="Duration" value={formatDuration(search.durationMs)} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <div className="app-panel rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-lp-cold-blue" />
              <p className="text-sm font-medium text-lp-ice-blue">{BRAND.name} summary</p>
            </div>
            <p className="text-sm leading-relaxed text-lp-muted">{summary}</p>
            {search.relaxNote && (
              <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
                {search.relaxNote}
              </p>
            )}
            {search.errorMessage && (
              <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/5 px-3 py-2 text-xs text-red-300/90">
                {search.errorMessage}
              </p>
            )}
          </div>

          {search.criteriaSummary.length > 0 && (
            <div className="app-panel rounded-2xl p-5">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">
                Parsed criteria
              </p>
              <SearchCriteriaSummary items={search.criteriaSummary} />
            </div>
          )}
        </div>

        <SearchTimeline displayStatus={search.displayStatus} />
      </div>

      <LeadResultsTable
        leads={leads}
        searchId={search.id}
        message={search.relaxNote ?? undefined}
        onSelectLead={setSelectedLead}
        minScoreFilter={0}
        totalSaved={search.totalQualified}
        pageOffset={search.leadsOffset ?? 0}
        canResume={Boolean(search.canResume)}
        onResume={async () => {
          const res = await fetch(`/api/searches/${search.id}/resume`, { method: "POST" });
          if (res.ok) window.location.href = `/app?searchId=${search.id}`;
          else {
            const body = await res.json().catch(() => ({}));
            alert(body.error || "Could not resume");
          }
        }}
        onPageChange={async (nextOffset) => {
          const offset = Math.max(0, nextOffset);
          await fetch(`/api/searches/${search.id}/enrich-page`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offset, limit: 200 }),
          }).catch(() => null);
          const res = await fetch(`/api/searches/${search.id}?limit=200&offset=${offset}`);
          if (!res.ok) return;
          const body = (await res.json()) as SearchDetailResponse;
          setData(body);
        }}
        showReasoning
      />

      <LeadDetailDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </motion.div>
  );
}
