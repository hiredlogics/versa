import { prisma } from "@/lib/db/prisma";

export interface UsageAnalytics {
  searchesAllTime: number;
  leadsAllTime: number;
  leadsWithEmail: number;
  averageScore: number | null;
  searchesLast30Days: number;
  leadsLast30Days: number;
  lastSearchAt: string | null;
}

export async function getUsageAnalytics(userId: string): Promise<UsageAnalytics> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    searchesAllTime,
    leadsAllTime,
    leadsWithEmail,
    scoreAgg,
    searchesLast30Days,
    leadsLast30Days,
    lastSearch,
  ] = await Promise.all([
    prisma.leadSearch.count({ where: { userId, deletedAt: null } }),
    prisma.lead.count({ where: { userId, deletedAt: null } }),
    prisma.lead.count({ where: { userId, deletedAt: null, hasEmail: true } }),
    prisma.lead.aggregate({
      where: { userId, deletedAt: null },
      _avg: { leadScore: true },
    }),
    prisma.leadSearch.count({
      where: { userId, deletedAt: null, createdAt: { gte: since } },
    }),
    prisma.lead.count({
      where: { userId, deletedAt: null, createdAt: { gte: since } },
    }),
    prisma.leadSearch.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const avg = scoreAgg._avg.leadScore;

  return {
    searchesAllTime,
    leadsAllTime,
    leadsWithEmail,
    averageScore: avg == null ? null : Math.round(avg * 10) / 10,
    searchesLast30Days,
    leadsLast30Days,
    lastSearchAt: lastSearch?.createdAt.toISOString() ?? null,
  };
}
