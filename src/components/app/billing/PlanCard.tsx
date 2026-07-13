"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CheckoutPlanKey } from "@/lib/billing/planLimits";
import { comparePlanTier } from "@/lib/billing/planLimits";

export function PlanCard({
  planKey,
  name,
  monthlyLeads,
  monthlySearches,
  features,
  isCurrent,
  currentPlanKey,
  loading,
  onSelect,
}: {
  planKey: CheckoutPlanKey;
  name: string;
  monthlyLeads: number;
  monthlySearches: number;
  features: string[];
  isCurrent: boolean;
  currentPlanKey: CheckoutPlanKey | null;
  loading?: boolean;
  onSelect: (plan: CheckoutPlanKey) => void;
}) {
  const tierDelta =
    currentPlanKey && !isCurrent ? comparePlanTier(planKey, currentPlanKey) : 0;

  const buttonLabel = isCurrent
    ? "Current plan"
    : tierDelta > 0
      ? "Upgrade"
      : tierDelta < 0
        ? "Switch plan"
        : "Choose plan";

  return (
    <div
      className={cn(
        "app-panel flex h-full flex-col rounded-2xl p-5 transition-colors",
        isCurrent && "border-lp-cold-blue/35 ring-1 ring-lp-cold-blue/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-lp-white">{name}</h3>
          <p className="mt-1 text-sm text-lp-muted">
            {monthlyLeads.toLocaleString()} leads · {monthlySearches.toLocaleString()} searches / mo
          </p>
        </div>
        {isCurrent && (
          <span className="rounded-full border border-lp-cold-blue/30 bg-lp-cold-blue/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-lp-ice-blue">
            Current
          </span>
        )}
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-lp-muted">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lp-cold-blue" strokeWidth={2} />
            {feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={isCurrent || loading}
        onClick={() => onSelect(planKey)}
        className={cn(
          "mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
          isCurrent
            ? "border border-lp-border bg-lp-panel/50 text-lp-muted"
            : "border border-lp-border bg-lp-white text-lp-black hover:opacity-90"
        )}
      >
        {loading ? "Redirecting…" : buttonLabel}
      </button>
    </div>
  );
}
