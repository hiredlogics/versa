"use client";

import type { SearchHistoryItem } from "@/lib/types/search-history";
import { SearchStatusBadge } from "@/components/app/searches/SearchStatusBadge";
import { SearchCriteriaSummary } from "@/components/app/searches/SearchCriteriaSummary";
import { SearchLeadPreviewList } from "@/components/app/searches/SearchLeadPreview";
import { SearchMetric } from "@/components/app/searches/SearchMetric";
import { OpenSearchChatButton } from "@/components/app/searches/OpenSearchChatButton";
import { motion, AnimatePresence } from "framer-motion";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SearchPreviewPanel({ search }: { search: SearchHistoryItem | null }) {
  return (
    <AnimatePresence mode="wait">
      {search ? (
        <motion.aside
          key={search.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          className="app-panel-strong sticky top-6 hidden max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl p-5 xl:block"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">
                Preview
              </p>
              <h3 className="mt-1 text-sm font-medium text-lp-white">Selected search</h3>
            </div>
            <SearchStatusBadge status={search.displayStatus} />
          </div>

          <p className="mb-4 line-clamp-4 text-sm leading-relaxed text-lp-muted">{search.prompt}</p>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <SearchMetric label="Found" value={String(search.totalFound)} />
            <SearchMetric label="Qualified" value={String(search.totalQualified)} />
            <SearchMetric
              label="Avg score"
              value={search.averageScore != null ? String(search.averageScore) : "—"}
            />
            <SearchMetric label="Date" value={formatDate(search.createdAt)} />
          </div>

          {search.criteriaSummary.length > 0 && (
            <div className="mb-4">
              <SearchCriteriaSummary items={search.criteriaSummary} />
            </div>
          )}

          <SearchLeadPreviewList leads={search.topLeads} />

          <div className="mt-5 flex flex-col gap-2">
            <a
              href={`/app/searches/${search.id}`}
              className="inline-flex items-center justify-center rounded-xl bg-lp-white px-4 py-2 text-sm font-medium text-lp-black"
            >
              View leads
            </a>
            <OpenSearchChatButton searchId={search.id} className="w-full" />
          </div>
        </motion.aside>
      ) : (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="app-panel sticky top-6 hidden max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl p-8 text-center xl:block"
        >
          <p className="text-sm text-lp-muted">Select a search to preview details.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
