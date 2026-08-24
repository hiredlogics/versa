import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { balance } from "@/lib/pipeline/credits";
import { isStaleRunning, toCreditsDTO } from "@/lib/pipeline/dto";
import {
  batchStartedEnvelope,
  fail,
  readBrief,
  startBatch,
  toErrorResponse,
} from "@/lib/pipeline/api";

export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const { id } = await context.params;

    const search = await prisma.leadSearch.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: {
        id: true,
        status: true,
        brief: true,
        leadsReturned: true,
        updatedAt: true,
      },
    });
    if (!search) return fail(404, "Search not found.");
    if (search.status === "NEEDS_INFO") {
      return fail(409, "Answer the outstanding questions first.");
    }

    // Reuses the stored brief: no re-parsing, no extra AI cost, no filter drift
    // between batch 1 and batch 5.
    const brief = readBrief(search.brief);
    if (!brief) return fail(409, "This search has no saved brief. Start a new search.");

    if (search.leadsReturned >= brief.requestedTotal) {
      return fail(409, "You already have every lead you asked for.");
    }

    if (search.status === "RUNNING") {
      const heldHolds = await prisma.creditHold.count({
        where: { searchId: id, status: "HELD" },
      });
      // A batch that died without settling would otherwise leave a dead button
      // and no explanation. Same predicate the UI reads, so they cannot drift.
      if (!isStaleRunning(search, heldHolds)) {
        return fail(409, "A batch is already running.");
      }
    }

    after(() => startBatch(user.id, id, brief));

    return NextResponse.json(
      batchStartedEnvelope({ searchId: id, credits: toCreditsDTO(await balance(user.id)) })
    );
  } catch (error) {
    return toErrorResponse(error, userId);
  }
}
