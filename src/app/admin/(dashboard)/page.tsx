import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { Badge } from "@/components/ui/Badge";
import { getAdminOverviewStats } from "@/lib/admin/stats";

export default async function AdminDashboard() {
  const stats = await getAdminOverviewStats();

  return (
    <div>
      <AdminPageHeader
        title="Overview"
        description="Platform health, growth, and operational metrics."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Total users" value={stats.totalUsers} hint={`+${stats.newUsersThisWeek} this week`} href="/admin/users" />
        <AdminStatCard label="Active subscriptions" value={stats.activeSubscriptions} href="/admin/billing" tone="success" />
        <AdminStatCard label="Total searches" value={stats.totalSearches} href="/admin/searches" />
        <AdminStatCard label="Total leads" value={stats.totalLeads} href="/admin/leads" />
        <AdminStatCard label="Failed searches" value={stats.failedSearches} href="/admin/searches" tone={stats.failedSearches > 0 ? "warning" : "default"} />
        <AdminStatCard label="Past due billing" value={stats.pastDueSubscriptions} href="/admin/billing" tone={stats.pastDueSubscriptions > 0 ? "danger" : "default"} />
        <AdminStatCard label="Exports" value={stats.totalExports} />
        <AdminStatCard label="AI success rate" value={`${stats.aiSuccessRate}%`} href="/admin/api-health" tone={stats.aiSuccessRate < 90 ? "warning" : "success"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-off-white">Subscribers by plan</h2>
          <div className="space-y-2">
            {stats.subscribersByPlan.length === 0 ? (
              <p className="text-sm text-muted">No subscriptions yet.</p>
            ) : (
              stats.subscribersByPlan.map((item) => (
                <div key={item.plan} className="flex items-center justify-between text-sm">
                  <span>{item.plan}</span>
                  <Badge color="blue">{item.count}</Badge>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-off-white">Recent signups</h2>
          <div className="space-y-3">
            {stats.recentUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-off-white">{user.name || user.email}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </div>
                <div className="text-right">
                  <Badge color={user.role === "ADMIN" ? "violet" : "default"}>{user.role}</Badge>
                  <p className="mt-1 text-xs text-muted">{user.createdAt.toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-off-white">Recent failed searches</h2>
            <Link href="/admin/searches" className="text-sm text-electric hover:underline">
              View all
            </Link>
          </div>
          {stats.recentFailedSearches.length === 0 ? (
            <p className="text-sm text-muted">No failed searches recently.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentFailedSearches.map((search) => (
                <div key={search.id} className="rounded-lg border border-glass-border p-3">
                  <p className="text-sm text-off-white">{search.prompt}</p>
                  <p className="mt-1 text-xs text-muted">
                    {search.user.email} · {search.createdAt.toLocaleString()}
                  </p>
                  {search.errorMessage && (
                    <p className="mt-2 text-xs text-red-300">{search.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
