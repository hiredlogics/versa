import { NextResponse } from "next/server";
import { adminSessionCookie } from "@/lib/admin/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(adminSessionCookie.name, "", {
    ...adminSessionCookie,
    maxAge: 0,
  });
  return response;
}
