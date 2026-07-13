"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { SearchStatusBadge } from "@/components/app/searches/SearchStatusBadge";
import { SearchMetric } from "@/components/app/searches/SearchMetric";
import { SearchCriteriaSummary } from "@/components/app/searches/SearchCriteriaSummary";
import { SearchLeadPreviewList } from "@/components/app/searches/SearchLeadPreview";
import { OpenSearchChatButton } from "@/components/app/searches/OpenSearchChatButton";
import { ExportButtons } from "@/components/app/ExportButtons";
import type { SearchHistoryItem } from "@/lib/types/search-history";
import { cn } from "@/lib/utils/cn";

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface SearchHistoryCardProps {
  search: SearchHistoryItem;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
}

export function SearchHistoryCard({
  search,
  index,
  selected,
  onSelect,
}: SearchHistoryCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      onClick={onSelect}
      className={cn(
        "group app-panel rounded-3xl p-5 transition-all duration-300 md:p-6",
        "hover:-translate-y-0.5 hover:border-lp-border-strong hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
        selected && "border-lp-border-strong ring-1 ring-lp-cold-blue/20",
        onSelect && "cursor-pointer"
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">
            Prompt
          </p>
          <p className="line-clamp-2 text-sm leading-relaxed text-lp-off-white">{search.prompt}</p>
        </div>
        <SearchStatusBadge status={search.displayStatus} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SearchMetric label="Found" value={search.totalFound.toLocaleString()} />
        <SearchMetric label="Qualified" value={search.totalQualified.toLocaleString()} />
        <SearchMetric
          label="Avg score"
          value={search.averageScore != null ? String(search.averageScore) : "—"}
        />
        <SearchMetric label="Date" value={formatDate(search.createdAt)} className="sm:col-span-1 col-span-2" />
      </div>

      {search.criteriaSummary.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">
            Derived filters
          </p>
          <SearchCriteriaSummary items={search.criteriaSummary} />
        </div>
      )}

      {(search.topTitles.length > 0 || search.topIndustries.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-lp-muted-dark">
          {search.topTitles.length > 0 && (
            <span>
              <span className="text-lp-muted">Top titles:</span> {search.topTitles.join(" · ")}
            </span>
          )}
          {search.topIndustries.length > 0 && (
            <span>
              <span className="text-lp-muted">Industries:</span> {search.topIndustries.join(" · ")}
            </span>
          )}
        </div>
      )}

      <div className="mb-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">
          Top lead preview
        </p>
        <SearchLeadPreviewList leads={search.topLeads} />
      </div>

      <div
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/app/searches/${search.id}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-lp-white px-4 py-2.5 text-sm font-medium text-lp-black transition-opacity hover:opacity-90 sm:flex-none sm:min-w-[130px]"
        >
          <Users className="h-4 w-4" />
          View leads
        </Link>
        <OpenSearchChatButton
          searchId={search.id}
          className="flex-1 sm:flex-none sm:min-w-[130px]"
        />
        <div className="flex flex-1 sm:flex-none">
          <ExportButtons searchId={search.id} />
        </div>
      </div>
    </motion.article>
  );
}
