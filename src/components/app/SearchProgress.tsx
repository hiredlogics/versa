"use client";

import { motion } from "framer-motion";
import { SearchStepCard } from "@/components/app/SearchStepCard";
import type { ParsedSearchCriteria } from "@/lib/validations/search-criteria";
import type { SearchStep } from "@/lib/types/lead-finder";
import { BRAND } from "@/config/brand";

function CriteriaSummary({ criteria }: { criteria?: ParsedSearchCriteria }) {
  if (!criteria) return null;

  const rows = [
    criteria.industry && `Industry: ${criteria.industry}`,
    criteria.country && `Country: ${criteria.country}`,
    (criteria.companySizeMin || criteria.companySizeMax) &&
      `Employees: ${criteria.companySizeMin ?? "any"}–${criteria.companySizeMax ?? "any"}`,
    criteria.jobTitles?.length && `Titles: ${criteria.jobTitles.join(", ")}`,
    criteria.intentSummary && criteria.intentSummary,
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-lp-border bg-lp-panel/60 p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-lp-muted">
        Extracted filters
      </p>
      <ul className="space-y-1 text-xs text-lp-muted">
        {rows.map((row) => (
          <li key={String(row)}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

function ScanPreview() {
  return (
    <div className="relative mt-4 overflow-hidden rounded-lg border border-lp-border bg-lp-black/40">
      <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-lp-cold-blue/20 to-transparent app-scan-line" />
      <div className="space-y-0 p-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-lp-border/50 py-2.5 last:border-0"
          >
            <div className="h-8 w-8 animate-pulse rounded-full bg-lp-panel-strong" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-32 animate-pulse rounded bg-lp-panel-strong" />
              <div className="h-2 w-48 animate-pulse rounded bg-lp-panel" />
            </div>
            <div className="h-5 w-10 animate-pulse rounded-full bg-lp-panel-strong" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SearchProgress({
  steps,
  criteria,
  active,
}: {
  steps: SearchStep[];
  criteria?: ParsedSearchCriteria;
  active: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="app-panel rounded-xl p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex gap-1">
          <span className="app-signal-dot h-1.5 w-1.5 rounded-full bg-lp-cold-blue" />
          <span className="app-signal-dot h-1.5 w-1.5 rounded-full bg-lp-cold-blue" />
          <span className="app-signal-dot h-1.5 w-1.5 rounded-full bg-lp-cold-blue" />
        </span>
        <p className="text-sm font-medium text-lp-ice-blue">{BRAND.name}</p>
      </div>

      <div className="space-y-1">
        {steps.map((step) => (
          <SearchStepCard key={step.id} step={step} />
        ))}
      </div>

      {criteria && <CriteriaSummary criteria={criteria} />}
      {active && <ScanPreview />}
    </motion.div>
  );
}
