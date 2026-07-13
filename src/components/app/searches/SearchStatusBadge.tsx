"use client";

import { cn } from "@/lib/utils/cn";
import type { SearchDisplayStatus } from "@/lib/types/search-history";

const STATUS_CONFIG: Record<
  SearchDisplayStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  complete: {
    label: "Complete",
    dot: "bg-lp-success",
    bg: "bg-lp-success/10",
    text: "text-lp-success",
    border: "border-lp-success/25",
  },
  running: {
    label: "Running",
    dot: "bg-lp-cold-blue animate-pulse",
    bg: "bg-lp-cold-blue/10",
    text: "text-lp-ice-blue",
    border: "border-lp-cold-blue/25",
  },
  failed: {
    label: "Failed",
    dot: "bg-red-400/80",
    bg: "bg-red-500/10",
    text: "text-red-300/90",
    border: "border-red-400/20",
  },
  partial: {
    label: "Partial",
    dot: "bg-amber-400/80",
    bg: "bg-amber-500/10",
    text: "text-amber-200/90",
    border: "border-amber-400/20",
  },
  no_leads: {
    label: "No leads",
    dot: "bg-lp-muted-dark",
    bg: "bg-lp-panel-strong",
    text: "text-lp-muted",
    border: "border-lp-border",
  },
};

export function SearchStatusBadge({
  status,
  className,
}: {
  status: SearchDisplayStatus | string;
  className?: string;
}) {
  const key = (status in STATUS_CONFIG ? status : "complete") as SearchDisplayStatus;
  const config = STATUS_CONFIG[key];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
