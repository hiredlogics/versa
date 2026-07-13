"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SearchStep, SearchStepStatus } from "@/lib/types/lead-finder";

const statusIcon: Record<SearchStepStatus, React.ReactNode> = {
  pending: <Circle className="h-3.5 w-3.5 text-lp-muted-dark" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-lp-cold-blue" />,
  complete: <Check className="h-3.5 w-3.5 text-lp-success" />,
  failed: <X className="h-3.5 w-3.5 text-red-400" />,
};

export function SearchStepCard({ step }: { step: SearchStep }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300",
        step.status === "running"
          ? "border-lp-cold-blue/30 bg-lp-cold-blue/5"
          : step.status === "complete"
            ? "border-lp-border bg-lp-panel/50"
            : step.status === "failed"
              ? "border-red-500/30 bg-red-500/5"
              : "border-transparent bg-transparent"
      )}
    >
      <div className="mt-0.5 shrink-0">{statusIcon[step.status]}</div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            step.status === "running" ? "text-lp-ice-blue" : "text-lp-off-white"
          )}
        >
          {step.label}
        </p>
        {step.description && (
          <p className="mt-0.5 text-xs text-lp-muted-dark">{step.description}</p>
        )}
      </div>
    </div>
  );
}
