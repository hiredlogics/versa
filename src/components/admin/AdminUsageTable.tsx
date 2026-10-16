"use client";

import { Badge } from "@/components/ui/Badge";
import {
  AdminDataTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/AdminDataTable";

export type AdminUsageRow = {
  id: string;
  userEmail: string;
  leadsUsed: number;
  leadsLimit: number;
  searchesUsed: number;
  searchesLimit: number;
  periodStart: string;
  periodEnd: string;
};

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted">
        <span>{used}</span>
        <span>{limit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AdminUsageTable({ rows }: { rows: AdminUsageRow[] }) {
  return (
    <AdminDataTable>
      <AdminTableHead>
        <tr>
          <AdminTableHeaderCell>User</AdminTableHeaderCell>
          <AdminTableHeaderCell>Leads</AdminTableHeaderCell>
          <AdminTableHeaderCell>Searches</AdminTableHeaderCell>
          <AdminTableHeaderCell>Period</AdminTableHeaderCell>
          <AdminTableHeaderCell>Status</AdminTableHeaderCell>
        </tr>
      </AdminTableHead>
      <tbody>
        {rows.map((row) => {
          const overLeads = row.leadsUsed >= row.leadsLimit;
          const overSearches = row.searchesUsed >= row.searchesLimit;
          const overQuota = overLeads || overSearches;

          return (
            <AdminTableRow key={row.id}>
              <AdminTableCell>{row.userEmail}</AdminTableCell>
              <AdminTableCell className="min-w-[140px]">
                <UsageBar used={row.leadsUsed} limit={row.leadsLimit} />
              </AdminTableCell>
              <AdminTableCell className="min-w-[140px]">
                <UsageBar used={row.searchesUsed} limit={row.searchesLimit} />
              </AdminTableCell>
              <AdminTableCell className="text-muted">
                {new Date(row.periodStart).toLocaleDateString()} to{" "}
                {new Date(row.periodEnd).toLocaleDateString()}
              </AdminTableCell>
              <AdminTableCell>
                <Badge color={overQuota ? "violet" : "emerald"}>
                  {overQuota ? "Over quota" : "Within limits"}
                </Badge>
              </AdminTableCell>
            </AdminTableRow>
          );
        })}
      </tbody>
    </AdminDataTable>
  );
}
