"use client";

import { cn } from "@/lib/utils/cn";

const STEPS = ["Business", "Ideal customer", "Qualification", "Review"];

export function OnboardingProgress({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                i < step
                  ? "border-lp-cold-blue bg-lp-cold-blue/20 text-lp-ice-blue"
                  : i === step
                    ? "border-lp-ice-blue bg-lp-ice-blue/10 text-lp-white"
                    : "border-lp-border bg-lp-panel text-lp-muted-dark"
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:block",
                i <= step ? "text-lp-muted" : "text-lp-muted-dark"
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-lp-panel">
        <div
          className="h-full bg-lp-cold-blue transition-all duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
