"use client";

import { cn } from "@/lib/utils/cn";

function statusTone(status: string | null, isActive: boolean) {
  if (isActive) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (status === "PAST_DUE" || status === "UNPAID")
    return "bg-rose-500/15 text-rose-300 border-rose-500/25";
  if (status === "INCOMPLETE" || status === "INCOMPLETE_EXPIRED")
    return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  return "bg-lp-panel text-lp-muted border-lp-border";
}

function formatStatus(status: string | null, isActive: boolean) {
  if (isActive) return "Active";
  if (!status) return "No subscription";
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function CurrentPlanCard({
  displayPlanName,
  subscriptionStatus,
  isActive,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  onManage,
  manageDisabled,
  managing,
}: {
  displayPlanName: string | null;
  subscriptionStatus: string | null;
  isActive: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  onManage: () => void;
  manageDisabled?: boolean;
  managing?: boolean;
}) {
  const renewLabel = currentPeriodEnd
    ? `${cancelAtPeriodEnd ? "Ends" : "Renews"} ${new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : null;

  return (
    <div className="app-panel rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-lp-muted-dark">
            Current plan
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-lp-white">
            {displayPlanName ?? "No plan selected"}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                statusTone(subscriptionStatus, isActive)
              )}
            >
              {formatStatus(subscriptionStatus, isActive)}
            </span>
            {renewLabel && <span className="text-sm text-lp-muted">{renewLabel}</span>}
          </div>
          {cancelAtPeriodEnd && isActive && (
            <p className="mt-3 text-sm text-amber-200/90">
              Your subscription will cancel at the end of this billing period.
            </p>
          )}
          {!isActive && (subscriptionStatus === "INCOMPLETE" || subscriptionStatus === "INCOMPLETE_EXPIRED") && (
            <p className="mt-3 text-sm text-lp-muted">
              Payment setup incomplete. Complete checkout to unlock lead search.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onManage}
          disabled={manageDisabled || managing}
          className="rounded-xl border border-lp-border bg-lp-panel px-4 py-2.5 text-sm font-medium text-lp-off-white transition-colors hover:border-lp-border-strong hover:bg-lp-panel-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {managing ? "Opening…" : "Manage subscription"}
        </button>
      </div>
    </div>
  );
}
