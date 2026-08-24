import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { LEAD_SELECT, toLeadDTO } from "@/lib/pipeline/dto";

export async function GET() {
  try {
    const user = await requireUser();
    // Explicit select and DTO mapping: an unselected findMany shipped the
    // stored raw provider payload to the browser for 500 leads at a time.
    const leads = await prisma.lead.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { leadScore: "desc" },
      take: 500,
      select: LEAD_SELECT,
    });

    return NextResponse.json({ leads: leads.map(toLeadDTO) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
