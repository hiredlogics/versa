"use client";

import Link from "next/link";
import { BRAND } from "@/config/brand";
import { useAppShellData } from "@/components/app/AppShellDataProvider";
import { contextSummaryLine } from "@/lib/validations/onboarding-context";

export function LeadContextBanner() {
  const context = useAppShellData()?.leadContext ?? null;

  if (!context?.onboardingCompleted) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lp-border bg-lp-panel/60 px-3 py-2">
      <p className="text-xs text-lp-muted">
        <span className="text-lp-muted-dark">Using your saved {BRAND.name} context:</span>{" "}
        <span className="text-lp-off-white">{contextSummaryLine(context)}</span>
      </p>
      <Link
        href="/app/settings"
        className="text-xs font-medium text-lp-cold-blue hover:text-lp-ice-blue"
      >
        Edit context
      </Link>
    </div>
  );
}
