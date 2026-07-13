import { AdminDataTable, AdminEmptyState, AdminTableCell, AdminTableHead, AdminTableHeaderCell, AdminTableRow } from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ScoreBadge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db/prisma";

export default async function AdminLeadsPage() {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } } },
  });

  return (
    <div>
      <AdminPageHeader
        title="Leads"
        description="Review generated leads across all workspaces."
      />

      {leads.length === 0 ? (
        <AdminEmptyState message="No leads yet." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>Name</AdminTableHeaderCell>
              <AdminTableHeaderCell>Title</AdminTableHeaderCell>
              <AdminTableHeaderCell>Company</AdminTableHeaderCell>
              <AdminTableHeaderCell>Email</AdminTableHeaderCell>
              <AdminTableHeaderCell>Score</AdminTableHeaderCell>
              <AdminTableHeaderCell>Priority</AdminTableHeaderCell>
              <AdminTableHeaderCell>User</AdminTableHeaderCell>
              <AdminTableHeaderCell>Created</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <tbody>
            {leads.map((lead) => (
              <AdminTableRow key={lead.id}>
                <AdminTableCell className="font-medium">{lead.name}</AdminTableCell>
                <AdminTableCell>{lead.title}</AdminTableCell>
                <AdminTableCell>{lead.company}</AdminTableCell>
                <AdminTableCell className="text-muted">{lead.email || "—"}</AdminTableCell>
                <AdminTableCell>
                  <ScoreBadge score={lead.leadScore} />
                </AdminTableCell>
                <AdminTableCell>{lead.priorityLevel}</AdminTableCell>
                <AdminTableCell className="text-muted">{lead.user.email}</AdminTableCell>
                <AdminTableCell className="text-muted">
                  {lead.createdAt.toLocaleDateString()}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </div>
  );
}
