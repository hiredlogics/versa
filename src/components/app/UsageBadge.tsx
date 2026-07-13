"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { useAppShellData } from "@/components/app/AppShellDataProvider";

export function UsageBadge({ compact = false }: { compact?: boolean }) {
  const shell = useAppShellData();
  const usage = shell?.usage;

  if (!usage) {
    return (
      <span className="inline-flex h-7 w-24 animate-pulse rounded-full bg-lp-panel" aria-hidden />
    );
  }

  if (!usage.billingEnforced) {
    return (
      <Link
        href="/app/billing"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1 text-xs text-emerald-200 transition-colors hover:border-emerald-500/40"
        title="Billing limits are off in development"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        {compact ? "Unlimited" : "Unlimited · dev mode"}
      </Link>
    );
  }

  const remaining =
    usage.leadsRemaining ?? Math.max(0, usage.leadsLimit - usage.leadsUsed);
  const atLimit = usage.leadsLimit > 0 && usage.leadsUsed >= usage.leadsLimit;

  const label = compact
    ? `${remaining}/${usage.leadsLimit || "∞"}`
    : `${remaining} lead credits left`;

  return (
    <Link
      href="/app/billing"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-lp-panel px-3 py-1 text-xs transition-colors hover:border-lp-border-strong hover:bg-lp-panel-strong",
        atLimit || usage.usageExceededPlan
          ? "border-rose-500/30 text-rose-300"
          : "border-lp-border text-lp-muted"
      )}
      title={`Plan: ${usage.plan} · ${usage.leadsUsed}/${usage.leadsLimit} leads used`}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          atLimit ? "bg-rose-400" : "bg-lp-cold-blue"
        )}
        aria-hidden
      />
      {label}
    </Link>
  );
}

export function PlanBadge() {
  const shell = useAppShellData();
  const plan = shell?.planName;
  const isActive = shell?.isActive ?? true;

  if (!plan) {
    return <span className="h-6 w-16 animate-pulse rounded-full bg-lp-panel" aria-hidden />;
  }

  return (
    <Link
      href="/app/billing"
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-colors hover:border-lp-border-strong",
        isActive
          ? "border-lp-border bg-lp-panel text-lp-ice-blue"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      )}
    >
      {plan}
    </Link>
  );
}
