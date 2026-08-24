import { aiChat } from "@/lib/services/ai/aiRouter";
import type { Brief, VerifiedLead } from "./types";

/**
 * The why column is the product. Every lead gets one — a thin reason beats a
 * blank cell, which reads as broken.
 */

export const CHUNK_SIZE = 25;
export const CONCURRENCY = 4;
const MIN_WHY_LENGTH = 30;

/**
 * Filler a model reaches for when it has nothing specific to say, plus the
 * circular seniority reasoning a production run produced 50 times: "this person
 * is junior, therefore they want a job". One lead was described as a former
 * Vice President at JPMorgan Chase and as "entry-level" in the same sentence.
 */
const GENERIC_WHY =
  /matches your (criteria|search)|good fit|relevant role|(may|might|could) (be )?(open to|seeking|considering|exploring|interested in) new (opportunities|roles|challenges|job)|entry.level (position|status|seniority) (may|might|suggests|could)|desire to seek new/i;

/**
 * Deliberately says nothing about where the data came from. The model must
 * never learn the provider's name: it would eventually write it into a why
 * sentence, and that sentence ships in the CSV, which outlives the UI and
 * cannot be patched once a customer has forwarded it.
 */
const SYSTEM = `You write the "why reach out" line for a sales lead list.

For each person, write one or two specific sentences on why they are worth contacting, grounded in their title, company, industry, size and location.

Rules:
- No email drafts, greetings, subject lines, or sign-offs.
- No bullet points. Plain prose.
- Never claim facts you were not given: no funding rounds, no headcount growth, no job changes.
- Never write filler like "matches your criteria" or "good fit".
- Never infer intent, availability, or job-seeking from a seniority level. Being junior is not evidence that someone wants to move, and neither is being senior.
- Never state a seniority that contradicts the listed job history. Someone who was a Vice President is not entry-level.
- Never reuse the same reasoning shape across people. If the only thing you can say about someone is their seniority, say what their ROLE means for this search instead.
- Return every id you were given, unchanged.

Return JSON only: { "leads": [{ "id": "string", "why": "string" }] }`;

interface WhyPayloadItem {
  id: string;
  title: string;
  company: string;
  industry: string | null;
  employees: number | null;
  location: string | null;
}

/** Exactly the fields the model may see. Nothing else. */
export function toWhyPayload(lead: VerifiedLead): WhyPayloadItem {
  return {
    id: lead.candidate.providerId,
    title: lead.candidate.title,
    company: lead.candidate.company,
    industry: lead.candidate.industry,
    employees: lead.candidate.employees,
    location: lead.candidate.location,
  };
}

export function buildUserPrompt(leads: VerifiedLead[], brief: Brief): string {
  const focus = [
    brief.intent && `Looking for: ${brief.intent}`,
    brief.signals.length > 0 && `Priorities: ${brief.signals.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${focus}\n\nPeople:\n${JSON.stringify(leads.map(toWhyPayload), null, 2)}`;
}

/** Deterministic fallback. Never blank, and it always names the company. */
export function templateWhy(lead: VerifiedLead, brief: Brief): string {
  const { title, company, employees, location, industry } = lead.candidate;

  const where = location ? ` in ${location}` : "";
  const size = employees ? ` (~${employees.toLocaleString()} staff)` : "";
  const sector = industry ? ` in ${industry}` : "";
  const signal = brief.signals.length > 0 ? ` Worth raising ${brief.signals[0]}.` : "";

  return (
    `${title || "This contact"} at ${company}${size}${sector}${where} lines up with ` +
    `${brief.intent || "your search"}, so the role and company context justify a first touch.${signal}`
  ).replace(/\s+/g, " ").trim();
}

function usableWhy(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text.length >= MIN_WHY_LENGTH && !GENERIC_WHY.test(text);
}

/** Hand-rolled pool — no dependency for something this small. */
async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

async function writeChunk(
  chunk: VerifiedLead[],
  brief: Brief,
  meta?: { userId?: string; searchId?: string }
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  const sent = new Set(chunk.map((lead) => lead.candidate.providerId));

  const { content } = await aiChat({
    operation: "outreach",
    userId: meta?.userId,
    searchId: meta?.searchId,
    system: SYSTEM,
    user: buildUserPrompt(chunk, brief),
    jsonMode: true,
    temperature: 0.4,
  });

  const parsed = JSON.parse(content) as { leads?: Array<{ id?: unknown; why?: unknown }> };
  if (!Array.isArray(parsed.leads)) return byId;

  for (const entry of parsed.leads) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    // Match by id, never by position: a short or reordered response would
    // otherwise attach each reason to the wrong person, and every line would
    // still look plausible.
    if (!id || !sent.has(id) || byId.has(id)) continue;
    if (!usableWhy(entry.why)) continue;
    byId.set(id, (entry.why as string).trim());
  }

  return byId;
}

export async function writeWhy(
  leads: VerifiedLead[],
  brief: Brief,
  meta?: { userId?: string; searchId?: string }
): Promise<VerifiedLead[]> {
  if (leads.length === 0) return [];

  const chunks: VerifiedLead[][] = [];
  for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
    chunks.push(leads.slice(i, i + CHUNK_SIZE));
  }

  const maps = await runPool(chunks, CONCURRENCY, async (chunk) => {
    try {
      return await writeChunk(chunk, brief, meta);
    } catch (error) {
      console.warn(
        "[why] chunk failed, using templates:",
        error instanceof Error ? error.message : error
      );
      return new Map<string, string>();
    }
  });

  const written = new Map<string, string>();
  for (const map of maps) {
    for (const [id, why] of map) written.set(id, why);
  }

  return leads.map((lead) => {
    const aiWhy = written.get(lead.candidate.providerId);
    // whySource records what happened, not what was attempted — it is how we
    // measure AI failure rate in production later.
    return aiWhy
      ? { ...lead, why: aiWhy, whySource: "AI" as const }
      : { ...lead, why: templateWhy(lead, brief), whySource: "TEMPLATE" as const };
  });
}
