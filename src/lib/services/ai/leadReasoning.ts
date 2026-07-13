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

function formatLocation(location: string): string | null {
  const trimmed = location.trim();
  if (!trimmed || trimmed === "N/A") return null;
  return trimmed;
}

function matchesTargetCountry(location: string, targetCountries: string[]): boolean {
  const loc = location.toLowerCase();
  return targetCountries.some((country) => {
    const c = country.toLowerCase().trim();
    return c && loc.includes(c);
  });
}

export function buildLeadWhyReasoning(
  lead: LeadReasoningInput,
  context: LeadScoreContext
): string {
  const ctx = context.leadContext;
  const location = formatLocation(lead.location);
  const sentences: string[] = [];

  const who = location
    ? `${lead.name} is ${lead.title} at ${lead.company} (${location}).`
    : `${lead.name} is ${lead.title} at ${lead.company}.`;
  sentences.push(who);

  const searchIntent = context.searchIntent || context.keywords || context.originalPrompt;
  if (searchIntent?.trim()) {
    sentences.push(`They match your search for "${searchIntent.trim()}".`);
  }

  if (ctx) {
    if (ctx.businessDescription?.trim()) {
      sentences.push(`For your business (${ctx.businessDescription.trim()}), this role is a relevant buyer contact.`);
    }

    const services = ctx.servicesToSell.filter(Boolean);
    if (services.length > 0) {
      sentences.push(
        `They may need what you sell: ${services.slice(0, 3).join(", ")}.`
      );
    }

    if (ctx.targetTitles.some((t) => lead.title.toLowerCase().includes(t.toLowerCase()))) {
      sentences.push("Their title aligns with your saved target buyer roles.");
    }

    if (
      ctx.targetIndustries.some((t) => lead.industry.toLowerCase().includes(t.toLowerCase()))
    ) {
      sentences.push(`They operate in your target industry (${lead.industry}).`);
    }

    if (
      ctx.targetCountries.length > 0 &&
      location &&
      matchesTargetCountry(location, ctx.targetCountries)
    ) {
      sentences.push(`Located in your target geography (${location}).`);
    }

    if (
      ctx.companySizeMin != null &&
      ctx.companySizeMax != null &&
      lead.employees >= ctx.companySizeMin &&
      lead.employees <= ctx.companySizeMax
    ) {
      sentences.push(
        `Company size (${lead.employees} employees) fits your ${ctx.companySizeMin}–${ctx.companySizeMax} employee range.`
      );
    }

    if (ctx.preferredOutreachAngle?.trim()) {
      sentences.push(`Suggested angle: ${ctx.preferredOutreachAngle.trim()}.`);
    }

    if (ctx.highQualityLeadNotes?.trim()) {
      sentences.push(`Quality signal: ${ctx.highQualityLeadNotes.trim()}.`);
    }
  }

  if (lead.profileSummary?.trim()) {
    sentences.push(lead.profileSummary.trim());
  }

  if (lead.hasEmail) {
    sentences.push(
      `Score ${lead.leadScore}/10 with verified email — worth contacting now while they fit your criteria.`
    );
  } else {
    sentences.push(
      `Score ${lead.leadScore}/10 — strong fit, but no verified email yet (try LinkedIn outreach).`
    );
  }

  return sentences.join(" ");
}

function buildReasoningSystem(context: LeadScoreContext): string {
  const ctx = context.leadContext;
  const ctxBlock = ctx
    ? `
Your user's business context:
- Company: ${ctx.companyName ?? "n/a"}
- Business: ${ctx.businessDescription ?? "n/a"}
- Services sold: ${ctx.servicesToSell.join(", ") || "n/a"}
- Target industries: ${ctx.targetIndustries.join(", ") || "n/a"}
- Target countries: ${ctx.targetCountries.join(", ") || "n/a"}
- Target titles: ${ctx.targetTitles.join(", ") || "n/a"}
- Company size: ${ctx.companySizeMin ?? "?"}-${ctx.companySizeMax ?? "?"}
- Outreach angle: ${ctx.preferredOutreachAngle ?? "n/a"}
- High quality notes: ${ctx.highQualityLeadNotes ?? "n/a"}
`
    : "";

  return `Write a concise "why reach out" explanation for each B2B lead.

Search intent: "${context.searchIntent || context.keywords || context.originalPrompt || ""}"
${ctxBlock}

For each lead, write 2-4 sentences that:
1. Identify who they are (use name, title, company, location).
2. Explain why they match the user's search and saved business context.
3. Explain why the user should email or contact them now (mention email availability and score).

Use profileSummary when provided. Be specific to the user's services and ICP — not generic.
Return JSON: { "leads": [{ "index": 0, "reasoning": "..." }] }`;
}

export async function generateLeadReasoningBatch(
  leads: LeadReasoningInput[],
  context: LeadScoreContext,
  meta?: { userId?: string; searchId?: string }
): Promise<string[]> {
  const heuristic = leads.map((lead) => buildLeadWhyReasoning(lead, context));

  if (leads.length === 0) return [];
  if (!hasAiProvidersConfigured()) return heuristic;

  try {
    const payload = leads.map((lead, index) => ({
      index,
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
      system: buildReasoningSystem(context),
      user: JSON.stringify(payload),
      jsonMode: true,
      temperature: 0.4,
    });

    const parsed = JSON.parse(content) as {
      leads?: Array<{ index: number; reasoning?: string }>;
    };

    const results = [...heuristic];
    for (const item of parsed.leads ?? []) {
      if (item.index >= 0 && item.index < leads.length && item.reasoning?.trim()) {
        results[item.index] = item.reasoning.trim();
      }
    }
    return results;
  } catch {
    return heuristic;
  }
}
