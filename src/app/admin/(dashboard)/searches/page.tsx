import Link from "next/link";
import { AdminEmptyState } from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SearchCriteriaSummary } from "@/components/app/searches/SearchCriteriaSummary";
import { SearchStatusBadge } from "@/components/ui/Badge";
import { formatSearchCriteria } from "@/lib/admin/stats";
import { prisma } from "@/lib/db/prisma";

export default async function AdminSearchesPage() {
  const searches = await prisma.leadSearch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } },
  });

  return (
    <div>
      <AdminPageHeader
        title="Searches"
        description="Monitor all lead searches across the platform."
      />

      {searches.length === 0 ? (
        <AdminEmptyState message="No searches yet." />
      ) : (
        <div className="space-y-3">
          {searches.map((search) => {
            const criteria = formatSearchCriteria(search.parsedCriteria);
            return (
              <div key={search.id} className="glass-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-off-white">{search.prompt}</p>
                    <p className="mt-1 text-xs text-muted">
                      {search.user.name || search.user.email} · {search.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <SearchStatusBadge status={search.status} />
                </div>

                {criteria.length > 0 && (
                  <div className="mt-3">
                    <SearchCriteriaSummary items={criteria} />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
                  <span>{search.leadsReturned} leads returned</span>
                  <span>{search.durationMs != null ? `${search.durationMs}ms` : "None"}</span>
                  <span>{search.aiProviderUsed || "No AI provider"}</span>
                  <Link href={`/app/searches/${search.id}`} className="text-electric hover:underline">
                    Open search
                  </Link>
                </div>

                {search.errorMessage && (
                  <p className="mt-2 text-xs text-red-300">{search.errorMessage}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
