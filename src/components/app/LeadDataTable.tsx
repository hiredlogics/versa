"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { ScoreBadge } from "@/components/ui/Badge";
import { Mail, ExternalLink, Download } from "lucide-react";

type LeadRow = {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string | null;
  linkedinUrl: string | null;
  leadScore: number;
  reasoning: string | null;
  hasEmail: boolean;
};

const columnHelper = createColumnHelper<LeadRow>();

const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("title", { header: "Title" }),
  columnHelper.accessor("company", { header: "Company" }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue() || <span className="text-muted">—</span>,
  }),
  columnHelper.accessor("leadScore", {
    header: "Score",
    cell: (info) => <ScoreBadge score={info.getValue()} />,
  }),
  columnHelper.display({
    id: "links",
    cell: ({ row }) => (
      <div className="flex gap-2">
        {row.original.email && (
          <a href={`mailto:${row.original.email}`} className="text-emerald"><Mail className="w-4 h-4" /></a>
        )}
        {row.original.linkedinUrl && (
          <a href={row.original.linkedinUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-electric">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    ),
  }),
];

export function LeadDataTable({ leads, searchId }: { leads: LeadRow[]; searchId?: string }) {
  const table = useReactTable({ data: leads, columns, getCoreRowModel: getCoreRowModel() });

  if (leads.length === 0) return <p className="text-muted text-sm">No leads match your criteria.</p>;

  return (
    <div className="rounded-xl border border-glass-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-glass-border bg-charcoal-light">
        <span className="text-sm text-muted">{leads.length} leads</span>
        {searchId && (
          <a
            href={`/api/export/csv?searchId=${searchId}`}
            className="text-xs text-electric flex items-center gap-1 hover:underline"
          >
            <Download className="w-3 h-3" /> CSV
          </a>
        )}
      </div>
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-charcoal-card sticky top-0">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left px-4 py-2 text-muted font-medium">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-glass-border hover:bg-white/5">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
