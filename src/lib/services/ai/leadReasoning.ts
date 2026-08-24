import type { LeadScoreContext } from "@/lib/types";
import { hasAiProvidersConfigured } from "@/lib/heuristic-parse";
import { aiChat } from "./aiRouter";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";

export interface LeadReasoningInput {
  name: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  location: string;
  hasEmail: boolean;
  leadScore: number;
  profileSummary?: string | null;
}

export interface LeadOutreachOutput {
  /** Personalized "Why Reach Out" — specific to this person, not score bullets */
  reasoning: string;
  /** Kept for schema compatibility — email drafting disabled */
  emailDraft: string;
}

const WHY_BATCH_SIZE = 12;

function formatLocation(location: string): string | null {
  const trimmed = location.trim();
  if (!trimmed || trimmed === "N/A") return null;
  return trimmed;
}

/** Pull concrete signals from LinkedIn-style titles / headlines. */
export function extractTitleSignals(title: string): string[] {
  const t = title.toLowerCase();
  const signals: string[] = [];

  const checks: Array<[RegExp, string]> = [
    [/\bh-?1b\b|\bvisa\b|\btransfer\s*eligible\b|\bgc\b|\bgreen\s*card\b/, "visa/relocation mobility"],
    [/\bopen\s*to\s*work\b|\blooking\s*for\b|\bseeking\b|\bavailable\b/, "actively job-seeking signal in title"],
    [/\bimmediate\b|\basap\b|\bready\s*to\s*(join|start)\b/, "immediate availability"],
    [/\bw2\b|\bc2c\b|\bcontract\b|\bfull[- ]?time\b|\bperm\b/, "employment-type preference in title"],
    [/\bfull[- ]?stack\b|\bjava\b|\bpython\b|\b\.net\b|\breact\b|\bnode\b|\baws\b|\bazure\b/, "named tech stack in title"],
    [/\blayoff\b|\brecently\s*laid\s*off\b|\bbetween\s*roles\b/, "between-roles / layoff signal"],
    [/\brelocat(e|ion)\b|\bopen\s*to\s*relocat/, "open to relocate"],
  ];

  for (const [re, label] of checks) {
    if (re.test(t)) signals.push(label);
  }
  return signals;
}

function cleanSearchIntent(context: LeadScoreContext): string {
  const raw = context.searchIntent || context.keywords || context.originalPrompt || "";
  return raw
    .replace(/\.\s*Original request:[\s\S]*$/i, "")
    .replace(/Lead search request[\s\S]*$/i, "")
    .trim()
    .slice(0, 180);
}

/**
 * Dynamic template "Why Reach Out" when AI is unavailable.
 * Aimed at the Excel-style paragraph, not "Matching role. Matches intent."
 */
export function buildLeadWhyReasoning(
  lead: LeadReasoningInput,
  context: LeadScoreContext
): LeadOutreachOutput {
  const location = formatLocation(lead.location);
  const intent = cleanSearchIntent(context);
  const titleSignals = extractTitleSignals(lead.title);
  const services = context.leadContext?.servicesToSell?.filter(Boolean).slice(0, 2) ?? [];
  const where = location ? ` in ${location}` : "";

  const who = `${lead.title} at ${lead.company}${where}`;
  const signalClause = titleSignals.length
    ? ` Title signals (${titleSignals.join("; ")}) add urgency and make outreach timely.`
    : "";

  let fit: string;
  if (context.openToWork) {
    fit = intent
      ? `is a strong hire / job-search fit for “${intent}” — Open to Work can’t be verified from public data, but role + company context still warrant outreach.`
      : `is a strong hire / job-search fit — Open to Work can’t be verified from public data, but role + company context still warrant outreach.`;
  } else if (intent) {
    fit = `is a strong ICP match for “${intent}”.`;
  } else {
    fit = `is a strong ICP match based on title and company.`;
  }

  const offer = services.length
    ? ` Your offer (${services.join(", ")}) maps cleanly to their seat.`
    : "";

  const profile = lead.profileSummary?.trim()
    ? ` Profile note: ${lead.profileSummary.trim().slice(0, 220)}`
    : "";

  const contact = lead.hasEmail
    ? " Email is available for a direct first touch."
    : " Reach out via LinkedIn if email is missing.";

  const reasoning = `${who} ${fit}${signalClause}${offer}${profile}${contact}`.replace(/\s+/g, " ").trim();

  return { reasoning, emailDraft: "" };
}

function buildWhySystem(context: LeadScoreContext): string {
  const ctx = context.leadContext;
  const ctxBlock = ctx
    ? `
Seller context (use only when relevant):
- Business: ${ctx.businessDescription ?? "n/a"}
- Services / value prop: ${ctx.servicesToSell.join(", ") || "n/a"}
- Target industries: ${ctx.targetIndustries.join(", ") || "n/a"}
- Target titles: ${ctx.targetTitles.join(", ") || "n/a"}
`
    : "";

  const mode = context.openToWork
    ? `Mode: hiring / open-to-work search.
- Do NOT claim they are unemployed or officially Open to Work unless profileSummary/title clearly says so.
- Prefer job-search urgency (visa/transfer, immediate, W2/C2C, stack keywords, layoff language in title).`
    : `Mode: B2B buyer outreach.
- Explain buying authority / ICP fit, not hiring fit.`;

  return `You write the "Why Reach Out" column for a lead spreadsheet.

Search intent: "${cleanSearchIntent(context)}"
Original prompt: "${(context.originalPrompt || "").slice(0, 240)}"
${ctxBlock}
${mode}

STYLE — match this reference quality (1–2 dense sentences, specific):
"Java full-stack developer at Morgan Stanley with H1B transfer eligibility and willingness to relocate is a strong visa-driven job-search fit. Even without explicit layoff confirmation, 'transfer eligible' typically indicates active movement and time sensitivity where an AI job search assistant is valuable."

HARD RULES:
- One unique paragraph per lead. Cite THIS person's title, company, and any concrete signals in the title/profileSummary.
- Never use generic score phrases: "Matching role", "Matches your search intent", "Matches saved target industry", "Good company size".
- No email draft, greeting, subject line, or bullet lists.
- If a detail is unknown, skip it — do not invent layoffs or Open to Work badges.

Return JSON only: { "leads": [{ "index": 0, "reasoning": "..." }] }`;
}

async function generateWhyChunk(
  leads: LeadReasoningInput[],
  context: LeadScoreContext,
  indexOffset: number,
  meta?: { userId?: string; searchId?: string }
): Promise<LeadOutreachOutput[]> {
  const heuristic = leads.map((lead) => buildLeadWhyReasoning(lead, context));

  const payload = leads.map((lead, i) => ({
    index: i,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry,
    employees: lead.employees,
    location: lead.location,
    hasEmail: lead.hasEmail,
    leadScore: lead.leadScore,
    profileSummary: lead.profileSummary ?? null,
    titleSignals: extractTitleSignals(lead.title),
  }));

  const { content } = await aiChat({
    userId: meta?.userId,
    searchId: meta?.searchId,
    operation: "outreach",
    system: buildWhySystem(context),
    user: JSON.stringify({ batchOffset: indexOffset, leads: payload }),
    jsonMode: true,
    temperature: 0.45,
  });

  const parsed = JSON.parse(content) as {
    leads?: Array<{ index: number; reasoning?: string }>;
  };

  const results = [...heuristic];
  for (const item of parsed.leads ?? []) {
    if (item.index < 0 || item.index >= leads.length) continue;
    const reasoning = item.reasoning?.trim();
    // Reject AI fall-backs that are still generic score bullets
    if (
      reasoning &&
      !/^matching role/i.test(reasoning) &&
      !/matches your search intent/i.test(reasoning) &&
      reasoning.length > 40
    ) {
      results[item.index] = { reasoning, emailDraft: "" };
    }
  }
  return results;
}

/** Personalized "Why Reach Out" for each lead — AI when possible, rich template otherwise. */
export async function generateLeadReasoningBatch(
  leads: LeadReasoningInput[],
  context: LeadScoreContext,
  meta?: { userId?: string; searchId?: string }
): Promise<LeadOutreachOutput[]> {
  if (leads.length === 0) return [];

  const heuristic = leads.map((lead) => buildLeadWhyReasoning(lead, context));
  if (!hasAiProvidersConfigured()) {
    console.warn("[leadReasoning] No AI providers — using dynamic template why-text.");
    return heuristic;
  }

  try {
    const all: LeadOutreachOutput[] = [];
    const chunkMs: number[] = [];
    let chunkFailures = 0;

    for (let offset = 0; offset < leads.length; offset += WHY_BATCH_SIZE) {
      const chunk = leads.slice(offset, offset + WHY_BATCH_SIZE);
      const chunkStarted = Date.now();
      try {
        const chunkResults = await generateWhyChunk(chunk, context, offset, meta);
        all.push(...chunkResults);
        const durationMs = Date.now() - chunkStarted;
        chunkMs.push(durationMs);
        logLeadFetch("stage_chunk", {
          stage: "why",
          searchId: meta?.searchId,
          offset,
          size: chunk.length,
          durationMs,
          ok: true,
        });
      } catch (chunkError) {
        chunkFailures += 1;
        const durationMs = Date.now() - chunkStarted;
        chunkMs.push(durationMs);
        logLeadFetch("stage_chunk", {
          stage: "why",
          searchId: meta?.searchId,
          offset,
          size: chunk.length,
          durationMs,
          ok: false,
          error: chunkError instanceof Error ? chunkError.message : String(chunkError),
        });
        console.warn(
          `[leadReasoning] AI why chunk offset=${offset} failed:`,
          chunkError instanceof Error ? chunkError.message : chunkError
        );
        all.push(...chunk.map((lead) => buildLeadWhyReasoning(lead, context)));
      }
    }

    const sorted = [...chunkMs].sort((a, b) => a - b);
    const medianMs =
      sorted.length === 0
        ? null
        : sorted[Math.max(0, Math.ceil(0.5 * sorted.length) - 1)];
    const p95Ms =
      sorted.length === 0
        ? null
        : sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];

    logLeadFetch("stage_chunk_summary", {
      stage: "why",
      searchId: meta?.searchId,
      leads: leads.length,
      chunkFailures,
      chunkCount: chunkMs.length,
      batchSize: WHY_BATCH_SIZE,
      medianMs,
      p95Ms,
      maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    });

    return all;
  } catch (error) {
    console.warn(
      "[leadReasoning] AI why failed, using template:",
      error instanceof Error ? error.message : error
    );
    logLeadFetch("stage_chunk_summary", {
      stage: "why",
      searchId: meta?.searchId,
      leads: leads.length,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      fallback: "template",
    });
    return heuristic;
  }
}
