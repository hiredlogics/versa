"use client";

import { useEffect, useState } from "react";
import type { FullBillingStatus } from "@/lib/billing/billingTypes";
import type { CheckoutPlanKey } from "@/lib/billing/planLimits";
import { BRAND } from "@/config/brand";
import { BillingWarning } from "./BillingWarning";
import { CurrentPlanCard } from "./CurrentPlanCard";
import { PlanCard } from "./PlanCard";
import { UsageMeterCard } from "./UsageMeterCard";

export function BillingPageClient({
  initialBilling = null,
}: {
  initialBilling?: FullBillingStatus | null;
}) {
  const [billing, setBilling] = useState<FullBillingStatus | null>(initialBilling);
  const [error, setError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlanKey | null>(null);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    if (initialBilling) return;

    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBilling(data as FullBillingStatus);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load billing"));
  }, [initialBilling]);

  async function checkout(plan: CheckoutPlanKey) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    setManaging(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing portal");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal failed");
    } finally {
      setManaging(false);
    }
  }

  function scrollToPlans() {
    document.getElementById("billing-plans")?.scrollIntoView({ behavior: "smooth" });
  }

  if (!billing && !error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-lp-panel" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-2xl bg-lp-panel" />
          <div className="h-40 animate-pulse rounded-2xl bg-lp-panel" />
        </div>
      </div>
    );
  }

  const currentPlanKey =
    billing?.availablePlans.find((p) => p.isCurrent)?.key ??
    (billing?.planSlug as CheckoutPlanKey | undefined) ??
    null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-lp-white md:text-3xl">Billing</h1>
        <p className="mt-2 text-sm text-lp-muted">{BRAND.billingSubheadline}</p>
      </header>

      {billing && (
        <>
          <BillingWarning
            subscriptionStatus={billing.subscriptionStatus}
            isActive={billing.isActive}
            usageExceededPlan={billing.usage.usageExceededPlan}
            onChoosePlan={scrollToPlans}
          />

          <div className="mt-6 space-y-6">
            <CurrentPlanCard
              displayPlanName={billing.displayPlanName}
              subscriptionStatus={billing.subscriptionStatus}
              isActive={billing.isActive}
              currentPeriodEnd={billing.currentPeriodEnd}
              cancelAtPeriodEnd={billing.cancelAtPeriodEnd}
              onManage={openPortal}
              manageDisabled={!billing.stripeCustomerId}
              managing={managing}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <UsageMeterCard
                title="Lead credits"
                remaining={billing.usage.leadsRemaining}
                used={billing.usage.leadsUsed}
                limit={billing.usage.leadsLimit}
                percent={billing.usage.leadsPercent}
              />
              <UsageMeterCard
                title="Searches"
                remaining={billing.usage.searchesRemaining}
                used={billing.usage.searchesUsed}
                limit={billing.usage.searchesLimit}
                percent={billing.usage.searchesPercent}
              />
            </div>

            <section id="billing-plans">
              <h2 className="mb-4 text-lg font-semibold text-lp-white">Plans</h2>
              <div className="grid gap-4 lg:grid-cols-3">
                {billing.availablePlans.map((plan) => (
                  <PlanCard
                    key={plan.key}
                    planKey={plan.key}
                    name={plan.name}
                    monthlyLeads={plan.monthlyLeads}
                    monthlySearches={plan.monthlySearches}
                    features={plan.features}
                    isCurrent={plan.isCurrent}
                    currentPlanKey={currentPlanKey}
                    loading={loadingPlan === plan.key}
                    onSelect={checkout}
                  />
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
