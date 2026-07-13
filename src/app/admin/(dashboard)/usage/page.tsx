import { AdminEmptyState } from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminUsageTable } from "@/components/admin/AdminUsageTable";
import { prisma } from "@/lib/db/prisma";

export default async function AdminUsagePage() {
  const usage = await prisma.usageRecord.findMany({
    orderBy: { periodStart: "desc" },
    take: 100,
    include: {
      user: {
        select: {
          email: true,
          subscription: { include: { plan: true } },
        },
      },
    },
  });

  const rows = usage.map((record) => ({
    id: record.id,
    userEmail: record.user.email,
    leadsUsed: record.leadsUsed,
    leadsLimit: record.user.subscription?.plan.leadsPerMonth ?? 0,
    searchesUsed: record.searchesUsed,
    searchesLimit: record.user.subscription?.plan.searchesPerMonth ?? 0,
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
  }));

  return (
    <div>
      <AdminPageHeader
        title="Usage"
        description="Monthly lead and search consumption against plan limits."
      />

      {rows.length === 0 ? (
        <AdminEmptyState message="No usage records yet." />
      ) : (
        <AdminUsageTable rows={rows} />
      )}
    </div>
  );
}
