import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    await prisma.lead.updateMany({
      where: { id, userId: user.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
