import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getFullBillingStatus } from "@/lib/billing/billingDashboard";
import { getUsageAnalytics } from "@/lib/services/billing/usageAnalytics";
import { UsageMeterCard } from "@/components/app/billing/UsageMeterCard";
import { getProcessBatchSize } from "@/lib/services/leads/fetchProgress";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="app-panel rounded-2xl p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-lp-muted-dark">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-lp-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-lp-muted">{hint}</p>}
    </div>
  );
}

export default async function UsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [billing, analytics] = await Promise.all([
    getFullBillingStatus(user.id),
    getUsageAnalytics(user.id),
  ]);

  const batchSize = getProcessBatchSize();
  const { usage } = billing;
  const batchesLeft = Math.floor(usage.leadsRemaining / batchSize);
  const periodEnd = billing.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-lp-white md:text-3xl">
          Plan &amp; usage
        </h1>
        <p className="mt-2 text-sm text-lp-muted">
          {billing.displayPlanName ?? "No active plan"}
          {periodEnd ? ` · resets ${periodEnd}` : ""} ·{" "}
          <Link href="/app/billing" className="app-link">
            Manage plan
          </Link>
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <UsageMeterCard
          title="Lead credits"
          remaining={usage.leadsRemaining}
          used={usage.leadsUsed}
          limit={usage.leadsLimit}
          percent={usage.leadsPercent}
        />
        <UsageMeterCard
          title="Searches"
          remaining={usage.searchesRemaining}
          used={usage.searchesUsed}
          limit={usage.searchesLimit}
          percent={usage.searchesPercent}
        />
      </div>

      <p className="mt-4 rounded-xl border border-lp-border bg-lp-panel/60 px-4 py-3 text-sm text-lp-muted">
        Leads are unlocked {batchSize} at a time so a single search can&apos;t drain your plan. You
        have enough credits for{" "}
        <span className="text-lp-off-white">
          {batchesLeft.toLocaleString()} more batch{batchesLeft === 1 ? "" : "es"}
        </span>{" "}
        of {batchSize} this period.
      </p>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-lp-white">Activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Searches run"
            value={analytics.searchesAllTime.toLocaleString()}
            hint={`${analytics.searchesLast30Days.toLocaleString()} in the last 30 days`}
          />
          <StatCard
            label="Leads saved"
            value={analytics.leadsAllTime.toLocaleString()}
            hint={`${analytics.leadsLast30Days.toLocaleString()} in the last 30 days`}
          />
          <StatCard
            label="With verified email"
            value={analytics.leadsWithEmail.toLocaleString()}
            hint={
              analytics.leadsAllTime > 0
                ? `${Math.round((analytics.leadsWithEmail / analytics.leadsAllTime) * 100)}% of saved leads`
                : "No leads saved yet"
            }
          />
          <StatCard
            label="Average score"
            value={analytics.averageScore != null ? String(analytics.averageScore) : "None"}
            hint={
              analytics.lastSearchAt
                ? `Last search ${new Date(analytics.lastSearchAt).toLocaleDateString()}`
                : "Run your first search to see this"
            }
          />
        </div>
      </section>
    </div>
  );
}
