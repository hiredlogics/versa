import type { PriorityLevel } from "@prisma/client";
import { applyExclusionScoreCap } from "@/lib/context/exclusions";
import { heuristicScoreLeadsBatch } from "@/lib/heuristic-scoring";
import type { LeadScoreContext } from "@/lib/types";
import { aiChat } from "./aiRouter";

export type ScoredLeadInput = {
  name: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  location: string;
  hasEmail?: boolean;
};

export type LeadScoreOutput = {
  leadScore: number;
  priorityLevel: "Low" | "Medium" | "High" | "Very High";
  reasoning: string;
  recommendedApproach: string;
};

function toPriority(score: number): LeadScoreOutput["priorityLevel"] {
  if (score >= 9) return "Very High";
  if (score >= 8) return "High";
  if (score >= 6) return "Medium";
  return "Low";
}

function toDbPriority(p: LeadScoreOutput["priorityLevel"]): PriorityLevel {
  const map: Record<string, PriorityLevel> = {
    Low: "LOW",
    Medium: "MEDIUM",
    High: "HIGH",
    "Very High": "VERY_HIGH",
  };
  return map[p] || "MEDIUM";
}

export { toDbPriority };

function buildScoringSystem(context: LeadScoreContext): string {
  const ctx = context.leadContext;
  const ctxBlock = ctx
    ? `
Saved business context:
- Business: ${ctx.businessDescription ?? "n/a"}
- Services sold: ${ctx.servicesToSell.join(", ") || "n/a"}
- Target industries: ${ctx.targetIndustries.join(", ") || "n/a"}
- Target countries: ${ctx.targetCountries.join(", ") || "n/a"}
- Target titles: ${ctx.targetTitles.join(", ") || "n/a"}
- Company size: ${ctx.companySizeMin ?? "?"}-${ctx.companySizeMax ?? "?"}
- Excluded titles: ${(context.excludedTitles ?? ctx.excludedTitles).join(", ") || "none"}
- High quality notes: ${ctx.highQualityLeadNotes ?? "n/a"}
- Bad lead notes: ${ctx.badLeadNotes ?? "n/a"}
`
    : "";

  return `Score B2B leads 1-10 for the user's search.

Search intent: "${context.searchIntent || context.keywords || ""}"
Current prompt: "${context.originalPrompt || ""}"
${ctxBlock}

Rules:
- Match saved ICP when prompt is vague.
- Cap relevance low if title is excluded unless prompt explicitly requests that role.
- Prefer decision-makers in target titles.
- Include ALL leads in response.

Return JSON: { "leads": [{ "index": 0, "leadScore": 8, "priorityLevel": "High", "reasoning": "...", "recommendedApproach": "..." }] }
priorityLevel: Low|Medium|High|Very High`;
}

function applyCaps(
  output: LeadScoreOutput,
  lead: ScoredLeadInput,
  context: LeadScoreContext
): LeadScoreOutput {
  const capped = applyExclusionScoreCap(
    output.leadScore,
    { title: lead.title, industry: lead.industry },
    context.excludedTitles ?? context.leadContext?.excludedTitles ?? [],
    context.excludedIndustries ?? context.leadContext?.excludedIndustries ?? [],
    context.originalPrompt ?? ""
  );
  if (capped !== output.leadScore) {
    return {
      ...output,
      leadScore: capped,
      priorityLevel: toPriority(capped),
      reasoning: `${output.reasoning}. Capped due to exclusion rules.`,
    };
  }
  return output;
}

export async function scoreLeadsWithAi(
  leads: ScoredLeadInput[],
  context: LeadScoreContext,
  meta?: { userId?: string; searchId?: string }
): Promise<{ scores: LeadScoreOutput[]; provider: string }> {
  const heuristicFixed = leads.map((lead) => {
    const h = heuristicScoreLeadsBatch([lead], context)[0];
    const base = {
      leadScore: h.score,
      priorityLevel: toPriority(h.score),
      reasoning: h.reasoning,
      recommendedApproach: "Personalize outreach based on their role and company context.",
    };
    return applyCaps(base, lead, context);
  });

  if (process.env.SCORING_MODE === "heuristic" || leads.length === 0) {
    return { scores: heuristicFixed, provider: "HEURISTIC" };
  }

  try {
    const payload = leads.map((l, i) => ({
      index: i,
      name: l.name,
      title: l.title,
      company: l.company,
      industry: l.industry,
      employees: l.employees,
      location: l.location,
      hasEmail: l.hasEmail ?? false,
    }));

    const { content, provider } = await aiChat({
      userId: meta?.userId,
      searchId: meta?.searchId,
      operation: "score",
      system: buildScoringSystem(context),
      user: JSON.stringify(payload),
      jsonMode: true,
      temperature: 0.3,
    });

    const parsed = JSON.parse(content) as {
      leads?: Array<LeadScoreOutput & { index: number }>;
    };

    const scores = [...heuristicFixed];
    for (const item of parsed.leads || []) {
      if (item.index >= 0 && item.index < leads.length) {
        const base = {
          leadScore: Math.min(10, Math.max(1, item.leadScore || 5)),
          priorityLevel: item.priorityLevel || toPriority(item.leadScore),
          reasoning: item.reasoning || "AI scored",
          recommendedApproach:
            item.recommendedApproach || heuristicFixed[item.index].recommendedApproach,
        };
        scores[item.index] = applyCaps(base, leads[item.index], context);
      }
    }
    return { scores, provider };
  } catch {
    return { scores: heuristicFixed, provider: "HEURISTIC" };
  }
}
