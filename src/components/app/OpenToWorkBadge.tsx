import { cn } from "@/lib/utils/cn";

export const OPEN_TO_WORK_NOTE = "Estimate from public signals. Not LinkedIn's Open to Work badge.";

const LEVELS: Record<string, { label: string; className: string }> = {
  likely: {
    label: "Likely looking",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  maybe: {
    label: "Maybe",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  unlikely: {
    label: "Unlikely",
    className: "border-lp-border bg-lp-panel text-lp-muted",
  },
};

/** Ranks levels for "Most likely to be looking" sorting; unknown levels sort last. */
export function openToWorkRank(level: string | null | undefined): number {
  return level === "likely" ? 3 : level === "maybe" ? 2 : level === "unlikely" ? 1 : 0;
}

export function OpenToWorkBadge({ level, title }: { level?: string | null; title?: string }) {
  const config = level ? LEVELS[level] : undefined;
  if (!config) return null;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        config.className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {config.label}
    </span>
  );
}
