import {
  AdminDataTable,
  AdminEmptyState,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db/prisma";

function subscriptionTone(status: string): "emerald" | "violet" | "blue" | "default" {
  if (status === "ACTIVE" || status === "TRIALING") return "emerald";
  if (status === "PAST_DUE" || status === "UNPAID") return "violet";
  if (status === "CANCELED") return "default";
  return "blue";
}

export default async function AdminBillingPage() {
  const [subs, stripeEvents] = await Promise.all([
    prisma.subscription.findMany({
      include: { user: { select: { email: true, name: true } }, plan: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.stripeEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Billing"
        description="Subscriptions, billing status, and recent Stripe webhook events."
      />

      {subs.length === 0 ? (
        <AdminEmptyState message="No subscriptions yet." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>User</AdminTableHeaderCell>
              <AdminTableHeaderCell>Plan</AdminTableHeaderCell>
              <AdminTableHeaderCell>Status</AdminTableHeaderCell>
              <AdminTableHeaderCell>Period</AdminTableHeaderCell>
              <AdminTableHeaderCell>Cancel at end</AdminTableHeaderCell>
              <AdminTableHeaderCell>Stripe</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <tbody>
            {subs.map((sub) => (
              <AdminTableRow key={sub.id}>
                <AdminTableCell>
                  <div>
                    <p className="font-medium">{sub.user.name || "—"}</p>
                    <p className="text-xs text-muted">{sub.user.email}</p>
                  </div>
                </AdminTableCell>
                <AdminTableCell>{sub.plan.name}</AdminTableCell>
                <AdminTableCell>
                  <Badge color={subscriptionTone(sub.status)}>{sub.status}</Badge>
                </AdminTableCell>
                <AdminTableCell className="text-muted">
                  {sub.currentPeriodStart && sub.currentPeriodEnd
                    ? `${sub.currentPeriodStart.toLocaleDateString()} – ${sub.currentPeriodEnd.toLocaleDateString()}`
                    : "—"}
                </AdminTableCell>
                <AdminTableCell>{sub.cancelAtPeriodEnd ? "Yes" : "No"}</AdminTableCell>
                <AdminTableCell className="font-mono text-xs text-muted">
                  {sub.stripeSubscriptionId || "—"}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-off-white">Recent Stripe events</h2>
        {stripeEvents.length === 0 ? (
          <AdminEmptyState message="No Stripe webhook events recorded yet." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Type</AdminTableHeaderCell>
                <AdminTableHeaderCell>Processed</AdminTableHeaderCell>
                <AdminTableHeaderCell>Event ID</AdminTableHeaderCell>
                <AdminTableHeaderCell>Received</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <tbody>
              {stripeEvents.map((event) => (
                <AdminTableRow key={event.id}>
                  <AdminTableCell>{event.type}</AdminTableCell>
                  <AdminTableCell>
                    <Badge color={event.processed ? "emerald" : "violet"}>
                      {event.processed ? "Processed" : "Pending"}
                    </Badge>
                  </AdminTableCell>
                  <AdminTableCell className="font-mono text-xs text-muted">
                    {event.stripeEventId}
                  </AdminTableCell>
                  <AdminTableCell className="text-muted">
                    {event.createdAt.toLocaleString()}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>
    </div>
  );
}
