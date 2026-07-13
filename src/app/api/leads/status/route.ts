import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getPlatformReadiness } from "@/lib/platform-readiness";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const readiness = getPlatformReadiness();

    return NextResponse.json({
      ...readiness,
      isAdmin: user?.role === "ADMIN",
    });
  } catch {
    return NextResponse.json({ error: "Failed to read platform status" }, { status: 500 });
  }
}
