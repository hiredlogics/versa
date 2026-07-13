import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { mapSearchToHistoryItem } from "@/lib/services/searches/searchHistory";
import { scopedLeadSearchWhere } from "@/lib/services/searches/access";

const LEAD_PREVIEW_SELECT = {
  id: true,
  name: true,
  title: true,
  company: true,
  industry: true,
  leadScore: true,
  priorityLevel: true,
} as const;

export async function GET() {
  try {
    const user = await requireUser();
    const searches = await prisma.leadSearch.findMany({
      where: scopedLeadSearchWhere(user.id),
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        leads: {
          where: { deletedAt: null },
          orderBy: { leadScore: "desc" },
          take: 10,
          select: LEAD_PREVIEW_SELECT,
        },
      },
    });

    return NextResponse.json({
      searches: searches.map(mapSearchToHistoryItem),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
