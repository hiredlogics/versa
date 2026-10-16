"use client";

import { cn } from "@/lib/utils/cn";
import { deriveMatchSignals, signalTone } from "@/lib/lead-signals";
import type { LeadRecord } from "@/lib/types/lead-finder";

const toneClasses: Record<string, string> = {
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  info: "border-lp-cold-blue/25 bg-lp-cold-blue/10 text-lp-ice-blue",
  neutral: "border-lp-border bg-lp-panel text-lp-muted",
};

export function LeadSignalBadges({
  lead,
  compact = false,
  max = 4,
}: {
  lead: Pick<LeadRecord, "reasoning" | "hasEmail" | "email" | "linkedinUrl">;
  compact?: boolean;
  max?: number;
}) {
  const signals = deriveMatchSignals(lead);
  const visible = compact ? signals.slice(0, max) : signals;
  const hidden = signals.length - visible.length;

  if (signals.length === 0) {
    return <span className="text-xs text-lp-muted-dark">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((signal) => (
        <span
          key={signal}
          className={cn(
            "inline-flex max-w-[160px] truncate rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight",
            toneClasses[signalTone(signal)]
          )}
          title={signal}
        >
          {signal}
        </span>
      ))}
      {hidden > 0 && (
        <span className="inline-flex items-center rounded-full border border-lp-border px-2 py-0.5 text-[10px] text-lp-muted-dark">
          +{hidden}
        </span>
      )}
    </div>
  );
}
