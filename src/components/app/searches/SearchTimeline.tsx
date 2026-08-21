"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { SearchDisplayStatus } from "@/lib/types/search-history";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { id: "parse", label: "Prompt interpreted" },
  { id: "filters", label: "Filters extracted" },
  { id: "search", label: "Lead search completed" },
  { id: "score", label: "Leads scored with AI" },
  { id: "save", label: "Results saved" },
];

function stepState(
  index: number,
  displayStatus: SearchDisplayStatus
): "complete" | "running" | "failed" | "pending" {
  if (displayStatus === "failed") {
    if (index < 2) return "complete";
    if (index === 2) return "failed";
    return "pending";
  }
  if (displayStatus === "running") {
    if (index === 0) return "complete";
    if (index === 1) return "running";
    return "pending";
  }
  return "complete";
}

export function SearchTimeline({ displayStatus }: { displayStatus: SearchDisplayStatus }) {
  return (
    <div className="app-panel rounded-2xl p-5">
      <p className="mb-4 text-[10px] font-medium uppercase tracking-wider text-lp-muted-dark">
        Search timeline
      </p>
      <ol className="space-y-3">
        {STEPS.map((step, index) => {
          const state = stepState(index, displayStatus);
          return (
            <li key={step.id} className="flex items-center gap-3">
              {state === "complete" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-lp-success" />
              )}
              {state === "running" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-lp-cold-blue" />
              )}
              {state === "failed" && (
                <XCircle className="h-4 w-4 shrink-0 text-red-400/80" />
              )}
              {state === "pending" && (
                <Circle className="h-4 w-4 shrink-0 text-lp-muted-dark" />
              )}
              <span
                className={cn(
                  "text-sm",
                  state === "complete" && "text-lp-off-white",
                  state === "running" && "text-lp-ice-blue",
                  state === "failed" && "text-red-300/90",
                  state === "pending" && "text-lp-muted-dark"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
