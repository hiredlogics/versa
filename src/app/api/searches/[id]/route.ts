import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";
import {
  buildCriteriaSummary,
  mapLeadToRecord,
  parseCriteria,
  resolveDisplayStatus,
} from "@/lib/services/searches/searchHistory";
import { scopedLeadSearchWhere } from "@/lib/services/searches/access";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    if (!id || id.length < 8) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const limitParam = Number(new URL(_req.url).searchParams.get("limit") || "200");
    const offsetParam = Number(new URL(_req.url).searchParams.get("offset") || "0");
    const leadLimit = Math.min(2000, Math.max(25, Number.isFinite(limitParam) ? limitParam : 200));
    const leadOffset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0);

    const search = await prisma.leadSearch.findFirst({
      where: scopedLeadSearchWhere(user.id, id),
      include: {
        leads: {
          where: { deletedAt: null },
          orderBy: { leadScore: "desc" },
          skip: leadOffset,
          take: leadLimit,
        },
      },
    });

    if (!search) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { canResumeSearch } = await import("@/lib/services/leads/fetchProgress");
    const parsedCriteria = parseCriteria(search.parsedCriteria);
    const leads = search.leads.map(mapLeadToRecord);
    const averageScore =
      leads.length > 0
        ? Math.round((leads.reduce((sum, lead) => sum + lead.leadScore, 0) / leads.length) * 10) /
          10
        : null;

    return NextResponse.json({
      search: {
        id: search.id,
        prompt: search.prompt,
        status: search.status,
        displayStatus: resolveDisplayStatus(
          search.status,
          search.leadsReturned,
          search.relaxNote
        ),
        parsedCriteria,
        criteriaSummary: buildCriteriaSummary(parsedCriteria),
        totalFound: search.totalAvailable ?? search.leadsReturned,
        totalQualified: search.leadsReturned,
        averageScore,
        createdAt: search.createdAt.toISOString(),
        updatedAt: search.updatedAt.toISOString(),
        durationMs: search.durationMs,
        relaxNote: search.relaxNote,
        errorMessage: search.errorMessage,
        aiProviderUsed: search.aiProviderUsed,
        leadsPreviewLimit: leadLimit,
        leadsOffset: leadOffset,
        canResume: canResumeSearch(
          search.apolloFilters,
          search.leadsReturned,
          search.totalAvailable,
          search.relaxNote
        ),
        jobRequirements: search.jobRequirements,
      },
      leads,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
