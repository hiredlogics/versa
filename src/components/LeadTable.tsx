"use client";

import { useState } from "react";
import {
  ExternalLink,
  Mail,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Briefcase,
  History,
  Copy,
  Check,
  Download,
} from "lucide-react";
import type { ScoredLead } from "@/lib/types";

interface LeadTableProps {
  leads: ScoredLead[];
  compact?: boolean;
  showAll?: boolean;
  conversationId?: string;
  onDelete?: (id: string) => void;
  showHistory?: boolean;
}

const PAGE_SIZE = 25;

export default function LeadTable({
  leads,
  compact = false,
  showAll = false,
  conversationId,
  onDelete,
  showHistory = false,
}: LeadTableProps) {
  const [page, setPage] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const paginate = !showAll && leads.length > PAGE_SIZE;
  const totalPages = Math.ceil(leads.length / PAGE_SIZE);
  const paginatedLeads = paginate
    ? leads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : leads;

  async function copyEmail(email: string, id: string) {
    await navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">No leads to display</div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {leads.length} lead{leads.length !== 1 ? "s" : ""}
          {showAll && leads.length > 20 ? " — scroll to view all" : ""}
        </span>
        {conversationId && (
          <a
            href={`/api/chat/${conversationId}/export?format=csv`}
            download
            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </a>
        )}
      </div>
      <div className={showAll && leads.length > 15 ? "max-h-[480px] overflow-y-auto" : ""}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Title</th>
              {!compact && (
                <th className="text-left px-4 py-2.5 font-medium text-emerald-600 dark:text-emerald-400">
                  Email
                </th>
              )}
              <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Company</th>
              {!compact && (
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Industry</th>
              )}
              <th className="text-center px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Score</th>
              {showHistory && (
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">History</th>
              )}
              <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 w-16">Links</th>
              {onDelete && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {paginatedLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{lead.name}</div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {lead.openToWork && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        <Briefcase className="w-2.5 h-2.5" /> Open to work
                      </span>
                    )}
                    {lead.hasEmail && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <Mail className="w-2.5 h-2.5" /> Email
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[140px] truncate">
                  {lead.title}
                </td>
                {!compact && (
                  <td className="px-4 py-3 max-w-[200px]">
                    {lead.email ? (
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-emerald-600 hover:underline truncate text-xs font-medium"
                          title={lead.email}
                        >
                          {lead.email}
                        </a>
                        <button
                          onClick={() => copyEmail(lead.email!, lead.id)}
                          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                          title="Copy email"
                        >
                          {copiedId === lead.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No email</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[130px] truncate">
                  {lead.company}
                </td>
                {!compact && (
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{lead.industry}</td>
                )}
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={lead.score} priority={lead.priority} />
                </td>
                {showHistory && (
                  <td className="px-4 py-3 max-w-[180px]">
                    {lead.history && lead.history.length > 0 ? (
                      <div className="space-y-1">
                        {lead.history.slice(-2).map((h, i) => (
                          <div key={i} className="text-[10px] text-gray-500 flex items-start gap-1">
                            <History className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span className="truncate" title={h.searchPrompt}>
                              {h.conversationTitle || h.action}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {compact && lead.email && (
                      <a href={`mailto:${lead.email}`} className="text-emerald-600" title={lead.email}>
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                    {lead.linkedinUrl && (
                      <a
                        href={lead.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-600"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
                {onDelete && (
                  <td className="px-2 py-3">
                    <button
                      onClick={() => onDelete(lead.id)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginate && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <span className="text-xs text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, leads.length)} of {leads.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score, priority }: { score: number; priority: string }) {
  const color =
    score >= 9
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : score >= 8
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        : "bg-gray-100 text-gray-600";

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${color}`} title={priority}>
      {score}
    </span>
  );
}
