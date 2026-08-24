import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { balance } from "@/lib/pipeline/credits";
import { LEAD_SELECT, toCreditsDTO, toLeadDTO, toSearchDTO } from "@/lib/pipeline/dto";
import { fail, readBrief, searchStateEnvelope, toErrorResponse } from "@/lib/pipeline/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const { id } = await context.params;

    // Explicit select, never a spread: the stored raw provider payload and the
    // provider's person id must not be readable here at all.
    const search = await prisma.leadSearch.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: {
        id: true,
        status: true,
        prompt: true,
        statusNote: true,
        leadsReturned: true,
        batchesDone: true,
        createdAt: true,
        updatedAt: true,
        brief: true,
        questions: true,
      },
    });

    if (!search) return fail(404, "Search not found.");

    const [leads, heldHolds, credits] = await Promise.all([
      prisma.lead.findMany({
        where: { searchId: id, deletedAt: null },
        orderBy: { leadScore: "desc" },
        select: LEAD_SELECT,
      }),
      prisma.creditHold.count({ where: { searchId: id, status: "HELD" } }),
      balance(user.id),
    ]);

    const brief = readBrief(search.brief);

    return NextResponse.json(
      searchStateEnvelope({
        search: toSearchDTO(search, brief?.requestedTotal ?? 0, heldHolds),
        understood: search.brief ?? null,
        questions: search.questions ?? null,
        leads: leads.map(toLeadDTO),
        credits: toCreditsDTO(credits),
      })
    );
  } catch (error) {
    return toErrorResponse(error, userId);
  }
}
