"use client";

import { Badge } from "@/components/ui/Badge";
import {
  AdminDataTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/AdminDataTable";

export type AiLogRow = {
  id: string;
  provider: string;
  operation: string;
  success: boolean;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export type ApolloLogRow = {
  id: string;
  endpoint: string;
  statusCode: number | null;
  resultCount: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export function AdminApiHealthPanel({
  aiLogs,
  apolloLogs,
  aiSuccessRate,
  apolloSuccessRate,
}: {
  aiLogs: AiLogRow[];
  apolloLogs: ApolloLogRow[];
  aiSuccessRate: number;
  apolloSuccessRate: number;
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-card p-4">
          <p className="text-sm text-muted">AI success rate (last 50)</p>
          <p className="mt-1 text-2xl font-bold text-off-white">{aiSuccessRate}%</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-sm text-muted">Apollo success rate (last 50)</p>
          <p className="mt-1 text-2xl font-bold text-off-white">{apolloSuccessRate}%</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-off-white">AI provider logs</h2>
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>Provider</AdminTableHeaderCell>
              <AdminTableHeaderCell>Operation</AdminTableHeaderCell>
              <AdminTableHeaderCell>Status</AdminTableHeaderCell>
              <AdminTableHeaderCell>Latency</AdminTableHeaderCell>
              <AdminTableHeaderCell>Time</AdminTableHeaderCell>
              <AdminTableHeaderCell>Error</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <tbody>
            {aiLogs.map((log) => (
              <AdminTableRow key={log.id}>
                <AdminTableCell>{log.provider}</AdminTableCell>
                <AdminTableCell>{log.operation}</AdminTableCell>
                <AdminTableCell>
                  <Badge color={log.success ? "emerald" : "violet"}>
                    {log.success ? "OK" : "Failed"}
                  </Badge>
                </AdminTableCell>
                <AdminTableCell className="text-muted">
                  {log.latencyMs != null ? `${log.latencyMs}ms` : "—"}
                </AdminTableCell>
                <AdminTableCell className="text-muted">
                  {new Date(log.createdAt).toLocaleString()}
                </AdminTableCell>
                <AdminTableCell className="max-w-xs truncate text-xs text-muted">
                  {log.errorMessage || "—"}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-off-white">Apollo API logs</h2>
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>Endpoint</AdminTableHeaderCell>
              <AdminTableHeaderCell>Status</AdminTableHeaderCell>
              <AdminTableHeaderCell>Results</AdminTableHeaderCell>
              <AdminTableHeaderCell>Latency</AdminTableHeaderCell>
              <AdminTableHeaderCell>Time</AdminTableHeaderCell>
              <AdminTableHeaderCell>Error</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <tbody>
            {apolloLogs.map((log) => (
              <AdminTableRow key={log.id}>
                <AdminTableCell className="font-mono text-xs">{log.endpoint}</AdminTableCell>
                <AdminTableCell>
                  <Badge color={log.errorMessage ? "violet" : "emerald"}>
                    {log.statusCode ?? (log.errorMessage ? "Error" : "OK")}
                  </Badge>
                </AdminTableCell>
                <AdminTableCell>{log.resultCount ?? "—"}</AdminTableCell>
                <AdminTableCell className="text-muted">
                  {log.latencyMs != null ? `${log.latencyMs}ms` : "—"}
                </AdminTableCell>
                <AdminTableCell className="text-muted">
                  {new Date(log.createdAt).toLocaleString()}
                </AdminTableCell>
                <AdminTableCell className="max-w-xs truncate text-xs text-muted">
                  {log.errorMessage || "—"}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      </section>
    </div>
  );
}
