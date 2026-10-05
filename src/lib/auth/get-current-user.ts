import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isConfiguredAdminEmail } from "@/lib/admin/credentials";
import { prisma } from "@/lib/db/prisma";
import type { User, UserRole } from "@prisma/client";

function resolveUserRole(email: string, clerkRole?: UserRole): UserRole {
  if (isConfiguredAdminEmail(email)) return "ADMIN";
  return clerkRole || "USER";
}

/**
 * Cached per request: the app layout, the paid layout and the page all ask for the user,
 * and this way Clerk and the database are asked once per page load, not three times.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) {
    const role = resolveUserRole(existing.email, existing.role);
    if (role !== existing.role) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { role },
      });
    }
    return existing;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  return prisma.user.create({
    data: {
      clerkId,
      email,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      role: resolveUserRole(email, clerkUser.publicMetadata?.role as UserRole),
    },
  });
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}
