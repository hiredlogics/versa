import { NextRequest, NextResponse } from "next/server";
import { isStaticAdminAuthConfigured, verifyAdminCredentials } from "@/lib/admin/credentials";
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

  if (!verifyAdminCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  }

  const token = createAdminSessionToken(email);
  const response = NextResponse.json({ success: true });
  response.cookies.set(adminSessionCookie.name, token, adminSessionCookie);
  return response;
}
