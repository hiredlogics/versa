"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  AdminDataTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/AdminDataTable";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  planName: string | null;
  subscriptionStatus: string | null;
  onboardingCompleted: boolean;
  searchCount: number;
  leadCount: number;
  createdAt: string;
};

export function AdminUsersTable({
  users,
  currentAdminEmail,
}: {
  users: AdminUserRow[];
  currentAdminEmail: string;
}) {
  const [rows, setRows] = useState(users);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateRole(userId: string, role: "USER" | "ADMIN") {
    setPendingId(userId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");

      setRows((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <AdminDataTable>
        <AdminTableHead>
          <tr>
            <AdminTableHeaderCell>User</AdminTableHeaderCell>
            <AdminTableHeaderCell>Role</AdminTableHeaderCell>
            <AdminTableHeaderCell>Plan</AdminTableHeaderCell>
            <AdminTableHeaderCell>Onboarding</AdminTableHeaderCell>
            <AdminTableHeaderCell>Searches</AdminTableHeaderCell>
            <AdminTableHeaderCell>Leads</AdminTableHeaderCell>
            <AdminTableHeaderCell>Joined</AdminTableHeaderCell>
            <AdminTableHeaderCell>Actions</AdminTableHeaderCell>
          </tr>
        </AdminTableHead>
        <tbody>
          {rows.map((user) => {
            const isSelf = user.email.toLowerCase() === currentAdminEmail.toLowerCase();
            return (
              <AdminTableRow key={user.id}>
                <AdminTableCell>
                  <div>
                    <p className="font-medium">{user.name || "None"}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <Badge color={user.role === "ADMIN" ? "violet" : "default"}>{user.role}</Badge>
                </AdminTableCell>
                <AdminTableCell>
                  <div>
                    <p>{user.planName || "None"}</p>
                    {user.subscriptionStatus && (
                      <p className="text-xs text-muted">{user.subscriptionStatus}</p>
                    )}
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <Badge color={user.onboardingCompleted ? "emerald" : "default"}>
                    {user.onboardingCompleted ? "Done" : "Pending"}
                  </Badge>
                </AdminTableCell>
                <AdminTableCell>{user.searchCount}</AdminTableCell>
                <AdminTableCell>{user.leadCount}</AdminTableCell>
                <AdminTableCell className="text-muted">
                  {new Date(user.createdAt).toLocaleDateString()}
                </AdminTableCell>
                <AdminTableCell>
                  {isSelf ? (
                    <span className="text-xs text-muted">You</span>
                  ) : (
                    <div className="flex gap-2">
                      {user.role === "USER" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingId === user.id}
                          onClick={() => updateRole(user.id, "ADMIN")}
                        >
                          Make admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pendingId === user.id}
                          onClick={() => updateRole(user.id, "USER")}
                        >
                          Remove admin
                        </Button>
                      )}
                    </div>
                  )}
                </AdminTableCell>
              </AdminTableRow>
            );
          })}
        </tbody>
      </AdminDataTable>
    </div>
  );
}
