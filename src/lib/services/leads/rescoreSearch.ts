import { prisma } from "@/lib/db/prisma";
import { scoreLeadsWithAi, toDbPriority } from "@/lib/services/ai/scoreLead";
import type { LeadScoreContext } from "@/lib/types";

/** Leads compared with each other in one AI call. */
const COMPARE_BATCH_SIZE = 50;
/** Upper bound per search, so a very large search stays a few quick AI calls. */
const MAX_RESCORED_LEADS = 200;

/**
 * Scores all of a search's leads again, side by side, so each score says how a lead
 * compares with the others found for the same search. Runs after every search step
 * (first run and each "Get next 100"). Leads the AI could not score keep their score.
 */
export async function rescoreSearchLeads(input: {
  userId: string;
  searchId: string;
  scoreContext: LeadScoreContext;
}): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: { searchId: input.searchId, userId: input.userId, deletedAt: null },
    // Best first, so each group of 50 holds leads of similar quality.
    orderBy: [{ leadScore: "desc" }, { createdAt: "asc" }],
    take: MAX_RESCORED_LEADS,
    select: {
      id: true,
      name: true,
      title: true,
      company: true,
      industry: true,
      employees: true,
      location: true,
      hasEmail: true,
      rawApolloData: true,
    },
  });
  if (leads.length < 2) return;

  const scored = await scoreLeadsWithAi(
    leads.map((lead) => ({
      name: lead.name,
      title: lead.title,
      company: lead.company,
      industry: lead.industry ?? "",
      employees: lead.employees ?? 0,
      location: lead.location ?? "",
      hasEmail: lead.hasEmail,
      headline: (lead.rawApolloData as { headline?: string | null } | null)?.headline ?? null,
      rawApolloData: lead.rawApolloData,
    })),
    { ...input.scoreContext, compareAcrossLeads: true },
    { userId: input.userId, searchId: input.searchId },
    { batchSize: COMPARE_BATCH_SIZE, ignoreCap: true }
  );

  const updates = leads.flatMap((lead, i) => {
    if (!scored.fromAi[i]) return [];
    const score = scored.scores[i];
    return [
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          leadScore: score.leadScore,
          priorityLevel: toDbPriority(score.priorityLevel),
          scorePros: score.pros ?? [],
          scoreCons: score.cons ?? [],
          matchedSkills: score.matchedSkills ?? [],
          missingSkills: score.missingSkills ?? [],
        },
      }),
    ];
  });
  if (updates.length > 0) await prisma.$transaction(updates);
}
