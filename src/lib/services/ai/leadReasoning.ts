import type { LeadScoreContext } from "@/lib/types";
import { hasAiProvidersConfigured } from "@/lib/heuristic-parse";
import { aiChat } from "./aiRouter";

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
  reasoning: string;
  emailDraft: string;
}

const OUTREACH_BATCH_SIZE = 8;

function formatLocation(location: string): string | null {
  const trimmed = location.trim();
  if (!trimmed || trimmed === "N/A") return null;
  return trimmed;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/** Fallback only when no AI provider is available. */
export function buildLeadWhyReasoning(
  lead: LeadReasoningInput,
  context: LeadScoreContext
): LeadOutreachOutput {
  const ctx = context.leadContext;
  const location = formatLocation(lead.location);
  const services = ctx?.servicesToSell?.filter(Boolean).slice(0, 2) ?? [];
  const offer = ctx?.mainOffer?.trim() || services[0] || "what we offer";
  const angle = ctx?.preferredOutreachAngle?.trim();
  const business = ctx?.businessDescription?.trim() || ctx?.companyName?.trim() || "our team";

  const who = location
    ? `${lead.name} is ${lead.title} at ${lead.company} (${location}).`
    : `${lead.name} is ${lead.title} at ${lead.company}.`;

  const whyParts = [who];
  const intent = context.searchIntent || context.keywords || context.originalPrompt;
  if (intent?.trim()) {
    whyParts.push(`They fit your search: "${intent.trim()}".`);
  }
  if (services.length) {
    whyParts.push(`Likely relevant for ${services.join(" / ")}.`);
  }
  if (lead.profileSummary?.trim()) {
    whyParts.push(lead.profileSummary.trim());
  }
  whyParts.push(
    lead.hasEmail
      ? `Score ${lead.leadScore}/10 with email — ready for a personalized send.`
      : `Score ${lead.leadScore}/10 — no email yet; use LinkedIn with the draft below.`
  );

  const subject = `${firstName(lead.name)} — quick idea for ${lead.company}`;
  const angleLine = angle
    ? angle
    : `I help teams like ${lead.company} with ${offer}.`;

  const emailDraft = [
    `Subject: ${subject}`,
    ``,
    `Hi ${firstName(lead.name)},`,
    ``,
    `I noticed you're ${lead.title} at ${lead.company}${location ? ` in ${location}` : ""}.`,
    ``,
    `${angleLine}`,
    ``,
    `At ${business}, we work with ${lead.industry !== "N/A" ? lead.industry + " " : ""}leaders on ${offer}.`,
    `If helpful, I can share a short example relevant to your role — happy to keep it brief.`,
    ``,
    `Worth a quick look?`,
    ``,
    `Best,`,
    `[Your name]`,
  ].join("\n");

  return {
    reasoning: whyParts.join(" "),
    emailDraft,
  };
}

function buildOutreachSystem(context: LeadScoreContext): string {
  const ctx = context.leadContext;
  const ctxBlock = ctx
    ? `
Seller (your user) context — use this to personalize EVERY email:
- Company: ${ctx.companyName ?? "n/a"}
- Business: ${ctx.businessDescription ?? "n/a"}
- Main offer: ${ctx.mainOffer ?? "n/a"}
- Services sold: ${ctx.servicesToSell.join(", ") || "n/a"}
- Target industries: ${ctx.targetIndustries.join(", ") || "n/a"}
- Target countries: ${ctx.targetCountries.join(", ") || "n/a"}
- Target titles: ${ctx.targetTitles.join(", ") || "n/a"}
- Preferred outreach angle: ${ctx.preferredOutreachAngle ?? "n/a"}
- High-quality lead notes: ${ctx.highQualityLeadNotes ?? "n/a"}
`
    : "";

  return `You are an expert B2B sales copywriter.

Search intent: "${context.searchIntent || context.keywords || context.originalPrompt || ""}"
${ctxBlock}

For EACH lead, return:
1. "reasoning" — 2–4 sentences answering: Who is this person, why do they match the seller's ICP/search, and why should the seller email them now? Be specific (name, title, company, location, profile). Not generic.
2. "emailDraft" — a ready-to-send cold email the seller can copy-paste, including:
   - First line: Subject: ...
   - Then greeting using first name
   - 4–7 short lines: reference their role/company/location, connect to the seller's offer/services, one clear CTA
   - Sign-off: Best, then [Your name]
   - Personalize with profileSummary when present
   - Never invent fake mutual connections or fake metrics
   - Write as the seller reaching out TO this lead

Return JSON only:
{ "leads": [{ "index": 0, "reasoning": "...", "emailDraft": "Subject: ...\\n\\nHi ..." }] }`;
}

async function generateOutreachChunk(
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
  }));

  const { content } = await aiChat({
    userId: meta?.userId,
    searchId: meta?.searchId,
    operation: "outreach",
    system: buildOutreachSystem(context),
    user: JSON.stringify({ batchOffset: indexOffset, leads: payload }),
    jsonMode: true,
    temperature: 0.55,
  });

  const parsed = JSON.parse(content) as {
    leads?: Array<{ index: number; reasoning?: string; emailDraft?: string }>;
  };

  const results = [...heuristic];
  for (const item of parsed.leads ?? []) {
    if (item.index < 0 || item.index >= leads.length) continue;
    const reasoning = item.reasoning?.trim();
    const emailDraft = item.emailDraft?.trim();
    if (reasoning || emailDraft) {
      results[item.index] = {
        reasoning: reasoning || results[item.index].reasoning,
        emailDraft: emailDraft || results[item.index].emailDraft,
      };
    }
  }
  return results;
}

/**
 * Prefer full AI customization (why + email draft). Falls back to template only if AI is unavailable.
 */
export async function generateLeadReasoningBatch(
  leads: LeadReasoningInput[],
  context: LeadScoreContext,
  meta?: { userId?: string; searchId?: string }
): Promise<LeadOutreachOutput[]> {
  if (leads.length === 0) return [];

  const heuristic = leads.map((lead) => buildLeadWhyReasoning(lead, context));
  if (!hasAiProvidersConfigured()) {
    console.warn(
      "[leadReasoning] No AI providers configured — using template outreach. Add OPENAI_API_KEY or GROQ_API_KEY for fully customized emails."
    );
    return heuristic;
  }

  try {
    const all: LeadOutreachOutput[] = [];
    for (let offset = 0; offset < leads.length; offset += OUTREACH_BATCH_SIZE) {
      const chunk = leads.slice(offset, offset + OUTREACH_BATCH_SIZE);
      const chunkResults = await generateOutreachChunk(chunk, context, offset, meta);
      all.push(...chunkResults);
    }
    return all;
  } catch (error) {
    console.warn(
      "[leadReasoning] AI outreach failed, using template fallback:",
      error instanceof Error ? error.message : error
    );
    return heuristic;
  }
}
