"use client";

import Link from "next/link";
import { BRAND } from "@/config/brand";
import { useAppShellData } from "@/components/app/AppShellDataProvider";

export function LeadContextBanner() {
  const context = useAppShellData()?.leadContext ?? null;

  if (!context?.onboardingCompleted) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lp-border bg-lp-panel/60 px-3 py-2">
      <p className="text-xs text-lp-muted">
        <span className="text-lp-off-white">Each prompt is searched on its own</span>
        <span className="text-lp-muted-dark">
          {" "}
          — {BRAND.name} pulls every match for that prompt (your saved ideal customer profile is not mixed in).
        </span>
      </p>
      <Link
        href="/app/settings"
        className="text-xs font-medium text-lp-cold-blue hover:text-lp-ice-blue"
      >
        Account settings
      </Link>
    </div>
  );
}
