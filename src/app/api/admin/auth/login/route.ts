import { NextRequest, NextResponse } from "next/server";
import { isStaticAdminAuthConfigured, verifyAdminCredentials } from "@/lib/admin/credentials";
import { clientIp, isAdminLoginBlocked, recordAdminLoginAttempt } from "@/lib/admin/loginThrottle";
import { adminSessionCookie, createAdminSessionToken } from "@/lib/admin/session";

export async function POST(request: NextRequest) {
  if (!isStaticAdminAuthConfigured()) {
    return NextResponse.json(
      { error: "Admin credentials are not configured on the server." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // Checked before the password so a blocked address learns nothing from further guesses.
  const ip = clientIp(request.headers);
  if (await isAdminLoginBlocked(ip)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  if (!verifyAdminCredentials(email, password)) {
    await recordAdminLoginAttempt(ip, email, false);
    return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  }

  await recordAdminLoginAttempt(ip, email, true);
  const token = createAdminSessionToken(email);
  const response = NextResponse.json({ success: true });
  response.cookies.set(adminSessionCookie.name, token, adminSessionCookie);
  return response;
}
