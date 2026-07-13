import { prisma } from "@/lib/db/prisma";

export async function getAdminOverviewStats() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersThisWeek,
    totalSearches,
    failedSearches,
    totalLeads,
    activeSubscriptions,
    pastDueSubscriptions,
    totalExports,
    recentFailedSearches,
    planGroups,
    aiLogs,
    apolloLogs,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
    prisma.leadSearch.count({ where: { deletedAt: null } }),
    prisma.leadSearch.count({ where: { status: "FAILED", deletedAt: null } }),
    prisma.lead.count({ where: { deletedAt: null } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
    prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    prisma.exportLog.count(),
    prisma.leadSearch.findMany({
      where: { status: "FAILED", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { email: true } } },
    }),
    prisma.subscription.groupBy({
      by: ["planId"],
      _count: { planId: true },
    }),
    prisma.aiProviderLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.apolloApiLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, email: true, name: true, createdAt: true, role: true },
    }),
  ]);

  const plans = await prisma.plan.findMany({
    select: { id: true, name: true, slug: true },
  });
  const planNameById = Object.fromEntries(plans.map((p) => [p.id, p.name]));
  const subscribersByPlan = planGroups.map((g) => ({
    plan: planNameById[g.planId] || "Unknown",
    count: g._count.planId,
  }));

  const aiSuccessRate =
    aiLogs.length > 0 ? Math.round((aiLogs.filter((l) => l.success).length / aiLogs.length) * 100) : 100;
  const apolloSuccessRate =
    apolloLogs.length > 0
      ? Math.round((apolloLogs.filter((l) => !l.errorMessage).length / apolloLogs.length) * 100)
      : 100;

  return {
    totalUsers,
    newUsersThisWeek,
    totalSearches,
    failedSearches,
    totalLeads,
    activeSubscriptions,
    pastDueSubscriptions,
    totalExports,
    recentFailedSearches,
    subscribersByPlan,
    aiSuccessRate,
    apolloSuccessRate,
    recentUsers,
  };
}

export function formatSearchCriteria(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const criteria = parsed as Record<string, unknown>;
  const items: string[] = [];
  for (const [key, value] of Object.entries(criteria)) {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) {
      items.push(`${key}: ${value.slice(0, 3).join(", ")}${value.length > 3 ? "…" : ""}`);
    } else if (typeof value === "object") {
      continue;
    } else {
      items.push(`${key}: ${String(value)}`);
    }
    if (items.length >= 4) break;
  }
  return items;
}
