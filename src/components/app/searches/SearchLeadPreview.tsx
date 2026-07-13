"use client";

import type { SearchLeadPreview } from "@/lib/types/search-history";
import { ScoreBadge } from "@/components/ui/Badge";

export function SearchLeadPreviewList({ leads }: { leads: SearchLeadPreview[] }) {
  if (leads.length === 0) {
    return (
      <p className="text-xs text-lp-muted-dark italic">No lead preview available for this search.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {leads.map((lead) => (
        <li
          key={lead.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-lp-border/60 bg-lp-black/30 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-lp-white">{lead.name}</p>
            <p className="truncate text-xs text-lp-muted">
              {lead.title} · {lead.company}
            </p>
          </div>
          <ScoreBadge score={lead.score} />
        </li>
      ))}
    </ul>
  );
}
