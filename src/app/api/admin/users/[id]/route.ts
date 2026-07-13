import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@prisma/client";
import { requireAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const role = body.role as UserRole;

    if (role !== "USER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.email.toLowerCase() === admin.email && role !== "ADMIN") {
      return NextResponse.json({ error: "You cannot remove your own admin access" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(user.clerkId, {
        publicMetadata: { role },
      });
    } catch {
      // Clerk sync is best-effort; DB role is source of truth for app logic.
    }

    await logAdminAction({
      adminId: admin.email,
      action: "user.role_updated",
      targetType: "user",
      targetId: user.id,
      metadata: { email: user.email, previousRole: user.role, newRole: role },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
