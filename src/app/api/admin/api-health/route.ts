import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await requireAdminSession();
    const logs = await prisma.aiProviderLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    const apollo = await prisma.apolloApiLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ ai: logs, apollo });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
