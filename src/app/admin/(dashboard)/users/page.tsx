import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/db/prisma";

export default async function AdminUsersPage() {
  const admin = await requireAdminPage();

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      subscription: { include: { plan: true } },
      leadContext: { select: { onboardingCompleted: true } },
      _count: { select: { leadSearches: true, leads: true } },
    },
  });

  const rows = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    planName: user.subscription?.plan.name ?? null,
    subscriptionStatus: user.subscription?.status ?? null,
    onboardingCompleted: user.leadContext?.onboardingCompleted ?? false,
    searchCount: user._count.leadSearches,
    leadCount: user._count.leads,
    createdAt: user.createdAt.toISOString(),
  }));

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description="Manage accounts, roles, onboarding status, and activity."
      />
      <AdminUsersTable users={rows} currentAdminEmail={admin.email} />
    </div>
  );
}
