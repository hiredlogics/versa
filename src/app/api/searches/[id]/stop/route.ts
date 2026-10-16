import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { scopedLeadSearchWhere } from "@/lib/services/searches/access";
import { USER_STOPPED_MESSAGE } from "@/lib/services/leads/searchControl";

/** POST: request stop; background job exits pagination and may save a partial result. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    if (!id || id.length < 8) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const search = await prisma.leadSearch.findFirst({
      where: scopedLeadSearchWhere(user.id, id),
      select: { id: true, status: true, leadsReturned: true, errorMessage: true },
    });

    if (!search) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (search.status === "COMPLETE") {
      return NextResponse.json({
        searchId: search.id,
        status: search.status,
        message: "Search already finished.",
      });
    }

    if (search.status === "FAILED") {
      return NextResponse.json({
        searchId: search.id,
        status: search.status,
        message: search.errorMessage || "Search already stopped or failed.",
      });
    }

    const updated = await prisma.leadSearch.update({
      where: { id: search.id },
      data: {
        // Keep RUNNING so the job can finish scoring/saving a partial pull
        errorMessage: USER_STOPPED_MESSAGE,
        relaxNote: "Stopping. Leads already found for this prompt are kept…",
      },
    });

    return NextResponse.json({
      searchId: updated.id,
      status: updated.status,
      message: USER_STOPPED_MESSAGE,
      leadsReturned: updated.leadsReturned,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
