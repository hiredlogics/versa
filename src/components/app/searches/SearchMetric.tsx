"use client";

import { cn } from "@/lib/utils/cn";

export function SearchMetric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-lp-off-white">{value}</p>
    </div>
  );
}
