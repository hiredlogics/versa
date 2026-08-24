import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { balance } from "@/lib/pipeline/credits";
import { toCreditsDTO } from "@/lib/pipeline/dto";
import { understand } from "@/lib/pipeline/understand";
import {
  clarificationEnvelope,
  fail,
  runningEnvelope,
  startBatch,
  toErrorResponse,
} from "@/lib/pipeline/api";

export const maxDuration = 300;

const bodySchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number()])),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const { id } = await context.params;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(400, "Send an answers object.");

    const search = await prisma.leadSearch.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true, status: true, prompt: true, answers: true, batchesDone: true },
    });
    if (!search) return fail(404, "Search not found.");
    if (search.status !== "NEEDS_INFO") {
      return fail(409, "This search is not waiting on answers.");
    }

    const merged = {
      ...((search.answers as Record<string, unknown>) ?? {}),
      ...parsed.data.answers,
    };

    const understanding = await understand(
      { prompt: search.prompt, answers: merged, round: search.batchesDone + countRounds(search.answers) },
      { userId: user.id, searchId: id }
    );

    if (understanding.status === "needs_clarification") {
      await prisma.leadSearch.update({
        where: { id },
        data: {
          answers: merged as object,
          brief: understanding.brief as object,
          questions: understanding.questions as object,
          statusNote: understanding.note ?? null,
        },
      });

      return NextResponse.json(
        clarificationEnvelope({
          searchId: id,
          understood: understanding.brief,
          questions: understanding.questions,
          exhausted: understanding.exhausted,
        })
      );
    }

    await prisma.leadSearch.update({
      where: { id },
      data: {
        status: "PENDING",
        answers: merged as object,
        brief: understanding.brief as object,
        questions: undefined,
        statusNote: understanding.note ?? null,
      },
    });

    after(() => startBatch(user.id, id, understanding.brief));

    return NextResponse.json(
      runningEnvelope({
        searchId: id,
        brief: understanding.brief,
        credits: toCreditsDTO(await balance(user.id)),
      })
    );
  } catch (error) {
    return toErrorResponse(error, userId);
  }
}

/** Rounds already spent asking, so the loop escape in understand() can fire. */
function countRounds(stored: unknown): number {
  if (!stored || typeof stored !== "object") return 0;
  return Object.keys(stored as Record<string, unknown>).length > 0 ? 1 : 0;
}
