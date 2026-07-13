"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BRAND } from "@/config/brand";

export function BillingWarning({
  subscriptionStatus,
  isActive,
  usageExceededPlan,
  onChoosePlan,
}: {
  subscriptionStatus: string | null;
  isActive: boolean;
  usageExceededPlan?: boolean;
  onChoosePlan?: () => void;
}) {
  if (isActive && !usageExceededPlan) return null;

  const isPaymentIssue =
    !isActive &&
    (subscriptionStatus === "INCOMPLETE" ||
      subscriptionStatus === "INCOMPLETE_EXPIRED" ||
      subscriptionStatus === "PAST_DUE" ||
      subscriptionStatus === "UNPAID");

  const title = usageExceededPlan
    ? "Usage exceeded plan limit"
    : isPaymentIssue
      ? "Subscription not active"
      : "Subscription inactive";

  const message = usageExceededPlan
    ? "Usage exceeded your plan limit due to previous tracking. Future searches are blocked until you upgrade or your next billing period begins."
    : isPaymentIssue
      ? `Your subscription status is ${(subscriptionStatus ?? "inactive").toLowerCase().replace(/_/g, " ")}. Complete checkout or choose a plan to continue using ${BRAND.name}.`
      : "Choose a plan to unlock lead search and manage your credits.";

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-lp-white">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-lp-muted">{message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {onChoosePlan && (
              <button
                type="button"
                onClick={onChoosePlan}
                className="rounded-xl bg-lp-white px-4 py-2 text-sm font-medium text-lp-black hover:opacity-90"
              >
                Choose a plan
              </button>
            )}
            <Link
              href="/pricing"
              className="rounded-xl border border-lp-border bg-lp-panel px-4 py-2 text-sm font-medium text-lp-off-white hover:bg-lp-panel-strong"
            >
              View pricing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
