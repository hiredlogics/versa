import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const leads = await prisma.lead.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { leadScore: "desc" },
      take: 500,
    });
    return NextResponse.json({ leads });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
