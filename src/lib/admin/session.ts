import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type AdminSession = {
  email: string;
  exp: number;
};

export const adminSessionCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_MAX_AGE_SEC,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function getSessionSecret(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET or ENCRYPTION_KEY must be at least 32 characters");
  }
  return secret;
}

function signPayload(payload: string): string {
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function parseSessionToken(token: string): AdminSession | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSession;
    if (!session.email || !session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function createAdminSessionToken(email: string): string {
  const session: AdminSession = {
    email: email.trim().toLowerCase(),
    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return signPayload(payload);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return parseSessionToken(token);
}

export function verifyAdminSessionToken(token: string): AdminSession | null {
  return parseSessionToken(token);
}
