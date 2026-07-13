import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db/prisma";

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { leadsPerMonth: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <div>
      <AdminPageHeader
        title="Plans"
        description="Subscription tiers, limits, and Stripe price mapping."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const features =
            plan.features && typeof plan.features === "object" && !Array.isArray(plan.features)
              ? Object.entries(plan.features as Record<string, unknown>)
              : [];

          return (
            <div key={plan.id} className="glass-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-off-white">{plan.name}</h2>
                  <p className="text-sm text-muted">{plan.slug}</p>
                </div>
                <Badge color={plan.isActive ? "emerald" : "default"}>
                  {plan.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted">Leads / month</p>
                  <p className="font-medium text-off-white">{plan.leadsPerMonth}</p>
                </div>
                <div>
                  <p className="text-muted">Searches / month</p>
                  <p className="font-medium text-off-white">{plan.searchesPerMonth}</p>
                </div>
                <div>
                  <p className="text-muted">Subscribers</p>
                  <p className="font-medium text-off-white">{plan._count.subscriptions}</p>
                </div>
                <div>
                  <p className="text-muted">Stripe price</p>
                  <p className="truncate font-mono text-xs text-off-white">
                    {plan.stripePriceId || "Not configured"}
                  </p>
                </div>
              </div>

              {features.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {features.map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full border border-glass-border bg-charcoal-card px-2.5 py-0.5 text-[11px] text-muted"
                    >
                      {key}: {Array.isArray(value) ? value.join(", ") : String(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
