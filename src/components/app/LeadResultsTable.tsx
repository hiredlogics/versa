"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ExternalLink, Mail, MailX, Search } from "lucide-react";
import { ScoreBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ExportButtons } from "@/components/app/ExportButtons";
import { LeadSignalBadges } from "@/components/app/LeadSignalBadges";
import type { LeadRecord } from "@/lib/types/lead-finder";
import { priorityLabel } from "@/lib/types/lead-finder";

const columnHelper = createColumnHelper<LeadRecord>();

interface LeadResultsTableProps {
  leads: LeadRecord[];
  searchId: string;
  message?: string;
  onSelectLead: (lead: LeadRecord) => void;
  minScoreFilter?: number;
  /** @deprecated Signals + why-matched columns are always shown */
  showReasoning?: boolean;
}

export function LeadResultsTable({
  leads,
  searchId,
  message,
  onSelectLead,
  minScoreFilter = 8,
}: LeadResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "leadScore", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");

  const filteredLeads = useMemo(
    () => leads.filter((l) => l.leadScore >= minScoreFilter),
    [leads, minScoreFilter]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => <span className="font-medium text-lp-white">{info.getValue()}</span>,
      }),
      columnHelper.accessor("title", { header: "Title" }),
      columnHelper.accessor("company", { header: "Company" }),
      columnHelper.accessor("leadScore", {
        header: "Score",
        cell: (info) => <ScoreBadge score={info.getValue()} />,
      }),
      columnHelper.display({
        id: "signals",
        header: "Signals",
        cell: ({ row }) => <LeadSignalBadges lead={row.original} compact max={3} />,
      }),
      columnHelper.accessor("email", {
        header: "Email",
        cell: ({ row }) => {
          const email = row.original.email;
          const hasEmail = row.original.hasEmail || Boolean(email);
          return (
            <div className="flex flex-col gap-1">
              <span
                className={
                  hasEmail
                    ? "inline-flex w-fit items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200"
                    : "inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200"
                }
              >
                {hasEmail ? (
                  <>
                    <Mail className="h-3 w-3" aria-hidden />
                    Verified
                  </>
                ) : (
                  <>
                    <MailX className="h-3 w-3" aria-hidden />
                    Missing
                  </>
                )}
              </span>
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="app-link max-w-[180px] truncate text-xs"
                  onClick={(e) => e.stopPropagation()}
                  title={email}
                >
                  {email}
                </a>
              ) : (
                <span className="text-xs text-lp-muted-dark">Not enriched yet</span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("reasoning", {
        header: "Why matched",
        cell: (info) => (
          <span className="line-clamp-3 max-w-[220px] text-xs leading-relaxed text-lp-muted">
            {info.getValue() || "Matched your search criteria"}
          </span>
        ),
      }),
      columnHelper.accessor("location", {
        header: "Location",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("priorityLevel", {
        header: "Priority",
        cell: (info) => (
          <span className="text-xs text-lp-muted">{priorityLabel(info.getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {row.original.linkedinUrl && (
              <a
                href={row.original.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1 text-lp-muted transition-colors hover:bg-lp-panel hover:text-lp-ice-blue"
                title="Open LinkedIn"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {row.original.email && (
              <a
                href={`mailto:${row.original.email}`}
                className="rounded-md p-1 text-lp-muted transition-colors hover:bg-lp-panel hover:text-lp-success"
                title="Send email"
              >
                <Mail className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
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
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  if (leads.length === 0) {
    return (
      <div className="app-panel rounded-xl p-8 text-center">
        <p className="text-sm text-lp-muted">No qualified leads matched your criteria.</p>
        <p className="mt-1 text-xs text-lp-muted-dark">Try broadening your prompt or lowering the minimum score.</p>
      </div>
    );
  }

  return (
    <div className="app-panel overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-lp-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-lp-white">
            {filteredLeads.length} qualified lead{filteredLeads.length !== 1 ? "s" : ""}
          </p>
          {message && <p className="text-xs text-lp-muted-dark">{message}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-lp-muted-dark" />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search results…"
              className="app-input w-full py-1.5 pl-8 text-xs sm:w-48"
            />
          </div>
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

      <div className="flex items-center justify-between border-t border-lp-border px-4 py-2.5">
        <p className="text-xs text-lp-muted-dark">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </p>
        <div className="flex gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
