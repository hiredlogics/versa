import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { leadIds, listName } = await request.json();

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds required" }, { status: 400 });
    }

    const list = await prisma.savedLeadList.create({
      data: {
        userId: user.id,
        name: listName || `Saved ${new Date().toLocaleDateString()}`,
        items: {
          create: leadIds.map((leadId: string) => ({ leadId })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ list });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
