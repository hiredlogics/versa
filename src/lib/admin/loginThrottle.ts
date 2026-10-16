import { prisma } from "@/lib/db/prisma";
import { logAdminAction } from "./audit";

export const MAX_FAILED_ADMIN_LOGINS = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const FAILED_ACTION = "admin_login_failed";
const SUCCESS_ACTION = "admin_login";

/**
 * Attempts are stored in AdminAuditLog rather than in memory: on serverless
 * hosting each instance has its own memory, so an in-memory counter would let
 * an attacker spread guesses across instances.
 */
function auditKey(ip: string) {
  return `ip:${ip}`;
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function isAdminLoginBlocked(ip: string, now = new Date()): Promise<boolean> {
  const failures = await prisma.adminAuditLog.count({
    where: {
      adminId: auditKey(ip),
      action: FAILED_ACTION,
      createdAt: { gte: new Date(now.getTime() - ADMIN_LOGIN_WINDOW_MS) },
    },
  });
  return failures >= MAX_FAILED_ADMIN_LOGINS;
}

export async function recordAdminLoginAttempt(ip: string, email: string, succeeded: boolean) {
  await logAdminAction({
    adminId: auditKey(ip),
    action: succeeded ? SUCCESS_ACTION : FAILED_ACTION,
    targetType: "ip",
    targetId: ip,
    metadata: { email },
  });
}
