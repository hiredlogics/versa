import { AdminApiHealthPanel } from "@/components/admin/AdminApiHealthPanel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { prisma } from "@/lib/db/prisma";

export default async function AdminApiHealthPage() {
  const [aiLogs, apolloLogs] = await Promise.all([
    prisma.aiProviderLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.apolloApiLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const aiSuccessRate =
    aiLogs.length > 0 ? Math.round((aiLogs.filter((l) => l.success).length / aiLogs.length) * 100) : 100;
  const apolloSuccessRate =
    apolloLogs.length > 0
      ? Math.round((apolloLogs.filter((l) => !l.errorMessage).length / apolloLogs.length) * 100)
      : 100;

  return (
    <div>
      <AdminPageHeader
        title="API Health"
        description="AI provider and Apollo API reliability across recent requests."
      />
      <AdminApiHealthPanel
        aiLogs={aiLogs.map((log) => ({
          id: log.id,
          provider: log.provider,
          operation: log.operation,
          success: log.success,
          latencyMs: log.latencyMs,
          errorMessage: log.errorMessage,
          createdAt: log.createdAt.toISOString(),
        }))}
        apolloLogs={apolloLogs.map((log) => ({
          id: log.id,
          endpoint: log.endpoint,
          statusCode: log.statusCode,
          resultCount: log.resultCount,
          latencyMs: log.latencyMs,
          errorMessage: log.errorMessage,
          createdAt: log.createdAt.toISOString(),
        }))}
        aiSuccessRate={aiSuccessRate}
        apolloSuccessRate={apolloSuccessRate}
      />
    </div>
  );
}
