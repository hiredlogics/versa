import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { POST } from "@/app/api/admin/auth/login/route";
import { MAX_FAILED_ADMIN_LOGINS } from "@/lib/admin/loginThrottle";
import { createAdminSessionToken, verifyAdminSessionToken } from "@/lib/admin/session";

const prisma = new PrismaClient();
const ADMIN_EMAIL = "admin-test@example.com";
const ADMIN_PASSWORD = "correct horse battery staple";
const ENV_KEYS = ["ADMIN_EMAILS", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"] as const;
const savedEnv: Record<string, string | undefined> = {};

let ip: string;

function login(password: string, fromIp = ip) {
  return POST(
    new NextRequest("http://localhost/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": fromIp },
      body: JSON.stringify({ email: ADMIN_EMAIL, password }),
    })
  );
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.ADMIN_SESSION_SECRET = "test-secret-that-is-at-least-32-characters";
  ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
});

afterEach(async () => {
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { startsWith: "ip:203.0.113." } } });
});

afterAll(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await prisma.$disconnect();
});

describe("admin login", () => {
  it("accepts the right password", async () => {
    const response = await login(ADMIN_PASSWORD);
    expect(response.status).toBe(200);
  });

  it("rejects a wrong password", async () => {
    const response = await login("wrong");
    expect(response.status).toBe(401);
  });

  it("blocks an address after too many wrong passwords, even with the right one", async () => {
    for (let i = 0; i < MAX_FAILED_ADMIN_LOGINS; i++) {
      expect((await login(`wrong-${i}`)).status).toBe(401);
    }

    expect((await login(ADMIN_PASSWORD)).status).toBe(429);
  });

  it("does not block a different address", async () => {
    for (let i = 0; i < MAX_FAILED_ADMIN_LOGINS; i++) await login(`wrong-${i}`);

    expect((await login(ADMIN_PASSWORD, "203.0.113.250")).status).toBe(200);
  });

  it("forgets failures older than the 15-minute window", async () => {
    const old = new Date(Date.now() - 16 * 60 * 1000);
    await prisma.adminAuditLog.createMany({
      data: Array.from({ length: MAX_FAILED_ADMIN_LOGINS }, () => ({
        adminId: `ip:${ip}`,
        action: "admin_login_failed",
        createdAt: old,
      })),
    });

    expect((await login(ADMIN_PASSWORD)).status).toBe(200);
  });

  it("rejects a session cookie whose signature was changed", () => {
    const token = createAdminSessionToken(ADMIN_EMAIL);
    expect(verifyAdminSessionToken(token)?.email).toBe(ADMIN_EMAIL);

    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifyAdminSessionToken(tampered)).toBeNull();
  });
});
