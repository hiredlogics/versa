import {
  AdminDataTable,
  AdminEmptyState,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { prisma } from "@/lib/db/prisma";

export default async function AdminAuditPage() {
  const logs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const adminIds = [...new Set(logs.map((log) => log.adminId))];
  const admins = await prisma.user.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, email: true },
  });
  const adminEmailById = Object.fromEntries(admins.map((admin) => [admin.id, admin.email]));

  return (
    <div>
      <AdminPageHeader
        title="Audit log"
        description="Administrative actions performed in the console."
      />

      {logs.length === 0 ? (
        <AdminEmptyState message="No admin actions recorded yet." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>Action</AdminTableHeaderCell>
              <AdminTableHeaderCell>Admin</AdminTableHeaderCell>
              <AdminTableHeaderCell>Target</AdminTableHeaderCell>
              <AdminTableHeaderCell>Details</AdminTableHeaderCell>
              <AdminTableHeaderCell>Time</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <tbody>
            {logs.map((log) => (
              <AdminTableRow key={log.id}>
                <AdminTableCell className="font-medium">{log.action}</AdminTableCell>
                <AdminTableCell className="text-muted">
                  {adminEmailById[log.adminId] || log.adminId}
                </AdminTableCell>
                <AdminTableCell className="text-muted">
                  {log.targetType ? `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}` : "None"}
                </AdminTableCell>
                <AdminTableCell className="max-w-sm truncate text-xs text-muted">
                  {log.metadata ? JSON.stringify(log.metadata) : "None"}
                </AdminTableCell>
                <AdminTableCell className="text-muted">
                  {log.createdAt.toLocaleString()}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </div>
  );
}
