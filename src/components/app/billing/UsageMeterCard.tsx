"use client";

import { cn } from "@/lib/utils/cn";

export function UsageMeterCard({
  title,
  remaining,
  used,
  limit,
  percent,
  unitLabel = "used",
}: {
  title: string;
  remaining: number;
  used: number;
  limit: number;
  percent: number;
  unitLabel?: string;
}) {
  const atLimit = limit > 0 && used >= limit;
  const nearLimit = !atLimit && percent >= 80;
  const displayUsed = used;
  const displayLimit = limit;

  const barColor = atLimit
    ? "bg-rose-400"
    : nearLimit
      ? "bg-amber-400"
      : "bg-lp-cold-blue";

  return (
    <div className="app-panel rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-lp-muted-dark">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-lp-white">
            {remaining.toLocaleString()}{" "}
            <span className="text-base font-normal text-lp-muted">remaining</span>
          </p>
        </div>
        {atLimit && (
          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
            Limit reached
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-lp-muted">
        {displayUsed.toLocaleString()} / {displayLimit.toLocaleString()} {unitLabel}
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-lp-panel-strong">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
