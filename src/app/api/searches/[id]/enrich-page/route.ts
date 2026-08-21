import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import { scopedLeadSearchWhere } from "@/lib/services/searches/access";
import { prepareLeadPage } from "@/lib/services/leads/enrichWhyBatch";

export const maxDuration = 300;

/**
 * POST — unlock emails + write Why Reach Out for one page (batch) of saved leads.
 * Body: { offset?: number, limit?: number } — defaults to first 200.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    if (!id || id.length < 8) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const search = await prisma.leadSearch.findFirst({
      where: scopedLeadSearchWhere(user.id, id),
      select: { id: true, status: true },
    });
    if (!search) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (search.status === "RUNNING") {
      return NextResponse.json(
        { error: "Search is still running. Wait until it finishes.", code: "RUNNING" },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      offset?: number;
      limit?: number;
      async?: boolean;
    };
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.min(200, Math.max(1, Number(body.limit) || 200));

    // Sync prepare for the visible batch so Next 200 returns emails + Why.
    if (body.async) {
      after(async () => {
        try {
          await prepareLeadPage({
            userId: user.id,
            searchId: id,
            offset,
            limit,
          });
        } catch (err) {
          console.error("[enrich-page] async failed", err);
        }
      });
      return NextResponse.json({ ok: true, queued: true, offset, limit });
    }

    const result = await prepareLeadPage({
      userId: user.id,
      searchId: id,
      offset,
      limit,
    });

    return NextResponse.json({
      ok: true,
      offset,
      limit,
      enriched: result.enriched,
      whyUpdated: result.whyUpdated,
      emailsUnlocked: result.emailsUnlocked,
      leads: result.leads,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 }
    );
  }
}
