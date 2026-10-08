"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  MailQuestion,
  MailX,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ExportButtons } from "@/components/app/ExportButtons";
import { emailConfidence, emailConfidenceLabel } from "@/lib/email-confidence";
import type { LeadRecord } from "@/lib/types/lead-finder";
import { formatSkillsBreakdown } from "@/lib/skills-breakdown";
import { ScoreWhy } from "@/components/app/ScoreWhy";
import { OPEN_TO_WORK_NOTE, OpenToWorkBadge, openToWorkRank } from "@/components/app/OpenToWorkBadge";

export const LEADS_PAGE_SIZE = 200;

const columnHelper = createColumnHelper<LeadRecord>();

interface LeadResultsTableProps {
  leads: LeadRecord[];
  searchId: string;
  message?: string;
  onSelectLead: (lead: LeadRecord) => void;
  minScoreFilter?: number;
  /** Total leads saved for this search (DB) */
  totalSaved?: number;
  /** Current server offset into the full saved set */
  pageOffset?: number;
  canResume?: boolean;
  onResume?: () => void;
  /** Fetch another batch of 200 from the server */
  onPageChange?: (nextOffset: number) => void;
  loadingPage?: boolean;
  resuming?: boolean;
  /** @deprecated */
  showReasoning?: boolean;
  /** @deprecated use onPageChange */
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function LeadResultsTable({
  leads,
  searchId,
  message,
  onSelectLead,
  minScoreFilter = 8,
  totalSaved,
  pageOffset = 0,
  canResume,
  onResume,
  onPageChange,
  loadingPage,
  resuming,
  loadingMore,
}: LeadResultsTableProps) {
  // No default sort: the server already returns leads best-score-first.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "open_to_work">("default");

  const filteredLeads = useMemo(() => {
    let list = leads.filter((l) => l.leadScore >= minScoreFilter);
    if (sortBy === "open_to_work") {
      list = [...list].sort(
        (a, b) => openToWorkRank(b.openToWorkLevel) - openToWorkRank(a.openToWorkLevel)
      );
    }
    return list;
  }, [leads, minScoreFilter, sortBy]);

  const savedCount = totalSaved ?? filteredLeads.length;
  const offset = Math.max(0, pageOffset);
  const rangeStart = savedCount === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + filteredLeads.length, savedCount);
  const totalBatches = Math.max(1, Math.ceil(savedCount / LEADS_PAGE_SIZE));
  const currentBatch = Math.floor(offset / LEADS_PAGE_SIZE) + 1;
  const canPrev = offset > 0 && Boolean(onPageChange);
  const canNext = offset + LEADS_PAGE_SIZE < savedCount && Boolean(onPageChange);
  const busy = Boolean(loadingPage || loadingMore || resuming);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => {
          const { openToWorkLevel, openToWorkReasons } = info.row.original;
          const tooltip = [...(openToWorkReasons ?? []), OPEN_TO_WORK_NOTE].join("\n");
          return (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-lp-white">{info.getValue()}</span>
              <OpenToWorkBadge level={openToWorkLevel} title={tooltip} />
            </div>
          );
        },
      }),
      columnHelper.accessor("leadScore", {
        header: "Score",
        cell: ({ row }) => (
          <ScoreWhy
            score={row.original.leadScore}
            pros={row.original.scorePros}
            cons={row.original.scoreCons}
            reasoning={row.original.reasoning}
          />
        ),
      }),
      columnHelper.accessor("reasoning", {
        header: "Why",
        cell: (info) => {
          const { leadScore, matchedSkills, missingSkills } = info.row.original;
          const breakdown = formatSkillsBreakdown(leadScore, matchedSkills, missingSkills);
          return (
            <div className="flex max-w-[360px] flex-col gap-1">
              {breakdown && <span className="text-xs font-medium text-lp-white">{breakdown}</span>}
              <span className="line-clamp-3 text-xs leading-relaxed text-lp-muted">
                {info.getValue() || "Personalized fit note pending"}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("email", {
        header: "Email",
        cell: ({ row }) => {
          const email = row.original.email;
          const hasEmail = Boolean(email) || row.original.hasEmail;
          const confidence = emailConfidence(email, row.original.emailStatus);
          return (
            <div className="flex flex-col gap-1">
              {email ? (
                <>
                  <a
                    href={`mailto:${email}`}
                    className="app-link max-w-[200px] truncate text-xs"
                    onClick={(e) => e.stopPropagation()}
                    title={email}
                  >
                    {email}
                  </a>
                  <span
                    className={
                      confidence === "verified"
                        ? "inline-flex w-fit items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200"
                        : "inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200"
                    }
                    title={
                      confidence === "verified"
                        ? "Confirmed mailbox"
                        : "Built from the company's email pattern, so it may bounce"
                    }
                  >
                    {confidence === "verified" ? (
                      <Mail className="h-3 w-3" aria-hidden />
                    ) : (
                      <MailQuestion className="h-3 w-3" aria-hidden />
                    )}
                    {emailConfidenceLabel(confidence)}
                  </span>
                </>
              ) : (
                <span className="inline-flex w-fit items-center gap-1 text-xs text-lp-muted-dark">
                  <MailX className="h-3 w-3" aria-hidden />
                  {hasEmail ? "Not unlocked" : "Missing"}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "linkedin",
        header: "LinkedIn",
        cell: ({ row }) =>
          row.original.linkedinUrl ? (
            <a
              href={row.original.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-lp-cold-blue hover:text-lp-ice-blue"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Profile
            </a>
          ) : (
            <span className="text-xs text-lp-muted-dark">None</span>
          ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredLeads,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (leads.length === 0 && savedCount === 0) {
    return (
      <div className="app-panel rounded-xl p-8 text-center">
        <p className="text-sm text-lp-muted">No qualified leads matched your criteria.</p>
        <p className="mt-1 text-xs text-lp-muted-dark">
          Try broadening your prompt or lowering the minimum score.
        </p>
      </div>
    );
  }

  return (
    <div className="app-panel overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-lp-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-lp-white">
            {savedCount.toLocaleString()} saved lead{savedCount !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-lp-muted">
            Showing {rangeStart.toLocaleString()} to {rangeEnd.toLocaleString()} of{" "}
            {savedCount.toLocaleString()}
            {savedCount > LEADS_PAGE_SIZE
              ? ` · batch ${currentBatch} of ${totalBatches}`
              : ""}
          </p>
          {message && <p className="mt-1 text-xs text-lp-muted-dark">{message}</p>}
          {canResume && onResume && (
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onResume}
                disabled={busy}
                className="text-xs"
              >
                {resuming ? "Getting next 100…" : "Get next 100"}
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-lp-muted-dark" />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search this batch…"
              className="app-input w-full py-1.5 pl-8 text-xs sm:w-48"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "default" | "open_to_work")}
            className="app-input rounded-lg border border-lp-border bg-lp-panel py-1.5 text-xs text-lp-off-white"
            aria-label="Sort order"
          >
            <option value="default">Default order</option>
            <option value="open_to_work">Most likely to be looking</option>
          </select>
          <ExportButtons searchId={searchId} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-lp-border bg-lp-panel/80">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-lp-muted-dark"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelectLead(row.original)}
                className="cursor-pointer border-b border-lp-border/60 transition-colors hover:bg-lp-panel/50"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top text-lp-muted">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-t border-lp-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-lp-muted-dark">
          {busy
            ? "Loading…"
            : savedCount > LEADS_PAGE_SIZE
              ? `Use Next / Previous to browse all ${savedCount.toLocaleString()} saved leads (${LEADS_PAGE_SIZE} at a time).`
              : `${filteredLeads.length} lead${filteredLeads.length !== 1 ? "s" : ""} in this search.`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange?.(Math.max(0, offset - LEADS_PAGE_SIZE))}
            disabled={!canPrev || busy}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous {LEADS_PAGE_SIZE}
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs text-lp-muted">
            {currentBatch}/{totalBatches}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange?.(offset + LEADS_PAGE_SIZE)}
            disabled={!canNext || busy}
            className="gap-1 text-xs"
          >
            Next {LEADS_PAGE_SIZE}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
