import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { scopedLeadSearchWhere } from "@/lib/services/searches/access";
import {
  canResumeSearch,
  resumeFindLeadsJob,
} from "@/lib/services/leads/findLeadsWorkflow";
import { toUserFacingSearchError } from "@/lib/services/leads/searchError";

export const maxDuration = 300;

/** POST: resume a partial Apollo pull for this search. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    if (!id || id.length < 8) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const search = await prisma.leadSearch.findFirst({
      where: scopedLeadSearchWhere(user.id, id),
      select: {
        id: true,
        status: true,
        leadsReturned: true,
        apolloFilters: true,
        totalAvailable: true,
      },
    });

    if (!search) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (search.status === "RUNNING") {
      return NextResponse.json(
        { error: "Search is already running.", code: "ALREADY_RUNNING" },
        { status: 409 }
      );
    }

    if (!canResumeSearch(search.apolloFilters, search.leadsReturned, search.totalAvailable)) {
      return NextResponse.json(
        {
          error: "Nothing left to resume for this search.",
          code: "CANNOT_RESUME",
          leadsReturned: search.leadsReturned,
          totalAvailable: search.totalAvailable,
        },
        { status: 400 }
      );
    }

    await prisma.leadSearch.update({
      where: { id: search.id },
      data: {
        status: "RUNNING",
        errorMessage: null,
        relaxNote: "Looking for more people…",
      },
    });

    after(async () => {
      try {
        await resumeFindLeadsJob(user, search.id);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Resume failed";
        console.error("[searches/resume] failed:", msg);
        await prisma.leadSearch.update({
          where: { id: search.id },
          data: { status: "FAILED", errorMessage: toUserFacingSearchError(msg) },
        });
      }
    });

    return NextResponse.json({
      searchId: search.id,
      status: "RUNNING",
      async: true,
      message: "Resume started, finding the next batch of matches.",
      leadsReturned: search.leadsReturned,
      totalAvailable: search.totalAvailable,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
