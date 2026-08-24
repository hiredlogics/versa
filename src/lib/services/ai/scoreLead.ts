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

/** Keep each OpenAI score call small enough to finish under AI_TIMEOUT_MS. */
export const SCORE_BATCH_SIZE = Math.min(
  40,
  Math.max(5, parseInt(process.env.AI_SCORE_BATCH_SIZE || "20", 10))
);

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
- Prefer decision-makers in target titles — UNLESS this is an open-to-work / hiring search.
- For open-to-work / job-seeking / "looking for a job" intent:
  - Score software engineers, developers, and matching titles at least 6–8 when location/role fit.
  - Do NOT require CEO/founder authority.
  - Do NOT penalize for missing email or employed status (Apollo can't prove open-to-work).
  - Explicit seeking/available/freelance title signals can go to 8–10.
- Include ALL leads in response (use the provided index values).

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

function heuristicScores(leads: ScoredLeadInput[], context: LeadScoreContext): LeadScoreOutput[] {
  return leads.map((lead) => {
    const h = heuristicScoreLeadsBatch([lead], context)[0];
    const base = {
      leadScore: h.score,
      priorityLevel: toPriority(h.score),
      reasoning: h.reasoning,
      recommendedApproach: "Personalize outreach based on their role and company context.",
    };
    return applyCaps(base, lead, context);
  });
}

export function chunkLeadsForScoring<T>(leads: T[], batchSize = SCORE_BATCH_SIZE): T[][] {
  if (leads.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < leads.length; i += batchSize) {
    chunks.push(leads.slice(i, i + batchSize));
  }
  return chunks;
}

async function scoreChunkWithAi(
  chunk: ScoredLeadInput[],
  absoluteOffset: number,
  context: LeadScoreContext,
  heuristicChunk: LeadScoreOutput[],
  meta?: { userId?: string; searchId?: string }
): Promise<{ scores: LeadScoreOutput[]; provider: string }> {
  const payload = chunk.map((l, i) => ({
    index: i,
    name: l.name,
    title: l.title,
    company: l.company,
    industry: l.industry,
    employees: l.employees,
    location: l.location,
    hasEmail: l.hasEmail ?? false,
  }));

  try {
    const { content, provider } = await aiChat({
      userId: meta?.userId,
      searchId: meta?.searchId,
      operation: "score",
      system: buildScoringSystem(context),
      user: JSON.stringify({ offset: absoluteOffset, leads: payload }),
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = JSON.parse(content) as {
      leads?: Array<LeadScoreOutput & { index: number }>;
    };

    const scores = [...heuristicChunk];
    for (const item of parsed.leads || []) {
      if (item.index >= 0 && item.index < chunk.length) {
        const base = {
          leadScore: Math.min(10, Math.max(1, item.leadScore || 5)),
          priorityLevel: item.priorityLevel || toPriority(item.leadScore),
          reasoning: item.reasoning || "AI scored",
          recommendedApproach:
            item.recommendedApproach || heuristicChunk[item.index].recommendedApproach,
        };
        scores[item.index] = applyCaps(base, chunk[item.index], context);
      }
    }
    return { scores, provider };
  } catch (error) {
    console.warn(
      `[scoreLead] AI score chunk offset=${absoluteOffset} size=${chunk.length} failed:`,
      error instanceof Error ? error.message : error
    );
    return { scores: heuristicChunk, provider: "HEURISTIC" };
  }
}

export async function scoreLeadsWithAi(
  leads: ScoredLeadInput[],
  context: LeadScoreContext,
  meta?: { userId?: string; searchId?: string }
): Promise<{ scores: LeadScoreOutput[]; provider: string }> {
  const heuristicFixed = heuristicScores(leads, context);

  // Very large pulls can't afford per-batch AI scoring — keep them heuristic-ranked.
  const aiScoreCap = Math.max(0, parseInt(process.env.AI_MAX_SCORE_COUNT || "40", 10));
  if (leads.length === 0 || (aiScoreCap > 0 && leads.length > aiScoreCap)) {
    if (leads.length > aiScoreCap) {
      console.log(
        `[scoreLead] ${leads.length} leads > AI_MAX_SCORE_COUNT=${aiScoreCap} — using heuristic scores`
      );
    }
    return { scores: heuristicFixed, provider: "HEURISTIC" };
  }

  const chunks = chunkLeadsForScoring(leads, SCORE_BATCH_SIZE);
  const scores = [...heuristicFixed];
  const providers = new Set<string>();

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const offset = c * SCORE_BATCH_SIZE;
    const heuristicChunk = heuristicFixed.slice(offset, offset + chunk.length);
    const { scores: chunkScores, provider } = await scoreChunkWithAi(
      chunk,
      offset,
      context,
      heuristicChunk,
      meta
    );
    providers.add(provider);
    for (let i = 0; i < chunkScores.length; i++) {
      scores[offset + i] = chunkScores[i];
    }
  }

  const aiProviders = [...providers].filter((p) => p !== "HEURISTIC");
  const provider =
    aiProviders.length > 0 ? aiProviders[0] : providers.has("HEURISTIC") ? "HEURISTIC" : "OPENAI";

  return { scores, provider };
}
