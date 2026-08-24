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

const bodySchema = z.object({ prompt: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return fail(400, "Describe who you want to find.");
    }

    // Checked BEFORE creating anything: a FAILED row for a search that never
    // started is a dead entry in the user's history, indistinguishable from a
    // search that genuinely broke.
    const credits = await balance(user.id);
    if (credits.remaining <= 0) {
      return fail(402, "You have no lead credits left this period.", {
        credits: toCreditsDTO(credits),
      });
    }

    const search = await prisma.leadSearch.create({
      data: { userId: user.id, prompt: parsed.data.prompt, status: "PENDING" },
    });

    let understanding;
    try {
      understanding = await understand({ prompt: parsed.data.prompt }, { userId: user.id, searchId: search.id });
    } catch (error) {
      // A real failure of a real request, so it is worth recording.
      await prisma.leadSearch.update({
        where: { id: search.id },
        data: { status: "FAILED", statusNote: "Could not read that prompt. Nothing was charged." },
      });
      return toErrorResponse(error, user.id);
    }

    if (understanding.status === "needs_clarification") {
      await prisma.leadSearch.update({
        where: { id: search.id },
        data: {
          status: "NEEDS_INFO",
          brief: understanding.brief as object,
          questions: understanding.questions as object,
          statusNote: understanding.note ?? "A couple of quick questions before we spend credits.",
        },
      });

      return NextResponse.json(
        clarificationEnvelope({
          searchId: search.id,
          understood: understanding.brief,
          questions: understanding.questions,
          exhausted: understanding.exhausted,
        })
      );
    }

    await prisma.leadSearch.update({
      where: { id: search.id },
      data: { status: "PENDING", brief: understanding.brief as object },
    });

    after(() => startBatch(user.id, search.id, understanding.brief));

    return NextResponse.json(
      runningEnvelope({
        searchId: search.id,
        brief: understanding.brief,
        credits: toCreditsDTO(credits),
      })
    );
  } catch (error) {
    return toErrorResponse(error, userId);
  }
}
