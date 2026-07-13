import { redirect } from "next/navigation";
import type { AdminSession } from "@/lib/admin/session";
import { getAdminSession } from "@/lib/admin/session";

export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
