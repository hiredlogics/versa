import { scoreTitle } from "@/lib/pipeline/verify";
import type { LeadScoreContext, SearchCriteria } from "@/lib/types";
import { aiChat } from "./aiRouter";

/**
 * A short yes/no check on free search data, run before any email is unlocked.
 * Scoring only changes the order, so without this a clearly wrong person is
 * still unlocked (and paid for) whenever the unlock budget has room.
 *
 * Kept apart from scoreLeadsWithAi on purpose: that call is heavy (pros, cons,
 * skills) and switches to heuristics above AI_MAX_SCORE_COUNT, which is every
 * normal batch. This call is small enough to run on every person.
 */

export type GateMode = "off" | "log" | "enforce";
export type GateVerdict = "match" | "partial" | "no" | "unknown";

export interface GateInput {
  id: string;
  title: string;
  headline?: string | null;
  company: string;
  industry?: string | null;
  employees?: number | null;
  location?: string | null;
}

export interface GateResult {
  verdict: GateVerdict;
  reason: string;
  /** For "no" only: was it the job itself, or the company / field around it? */
  basis?: "role" | "company";
}

export const GATE_CHUNK_SIZE = 25;
const GATE_CONCURRENCY = 4;
const CACHE_LIMIT = 5000;

/** off: never call. log: judge and record, reject nobody. enforce: drop "no". */
export function getRelevanceGateMode(raw = process.env.AI_RELEVANCE_GATE): GateMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "off" || value === "enforce") return value;
  return "log";
}

/**
 * The mode for one search. A company search wants everyone at that company,
 * whatever their role, so judging roles there would drop the very people asked for.
 */
export function gateModeFor(
  criteria: Pick<SearchCriteria, "companyOnly">,
  mode: GateMode = getRelevanceGateMode()
): GateMode {
  return criteria.companyOnly ? "off" : mode;
}

// Same person, same search, same answer: a resumed batch must not flip a verdict.
const cache = new Map<string, GateResult>();

function cacheKey(searchId: string | undefined, personId: string): string {
  return `${searchId ?? "-"}:${personId}`;
}

function remember(key: string, result: GateResult) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
}

export function clearRelevanceGateCache() {
  cache.clear();
}

/**
 * What the person asked for, in plain lines. Exclusions and open to work are
 * left out: their own filters run first, and judging them again on thin data
 * dropped people with no headline at all.
 */
export function buildGateCriteria(context: LeadScoreContext): string {
  const lines: string[] = [];
  if (context.originalPrompt?.trim()) lines.push(`Request: ${context.originalPrompt.trim()}`);
  if (context.searchIntent?.trim()) lines.push(`Intent: ${context.searchIntent.trim()}`);
  if (context.keywords?.trim()) lines.push(`Keywords: ${context.keywords.trim()}`);
  if (context.targetSkills?.length) lines.push(`Skills: ${context.targetSkills.join(", ")}`);
  for (const check of context.fitCriteria ?? []) lines.push(`Must fit: ${check}`);
  const ctx = context.leadContext;
  if (ctx?.highQualityLeadNotes) lines.push(`Good lead notes: ${ctx.highQualityLeadNotes}`);
  if (ctx?.badLeadNotes) lines.push(`Bad lead notes: ${ctx.badLeadNotes}`);
  return lines.join("\n");
}

const SYSTEM = `You check whether people fit a lead search.

For each person, answer one of:
- "match": their title, headline or company clearly fits the request.
- "partial": they plausibly fit, or fit some of it.
- "no": the data you were given clearly shows they do not fit (wrong role, wrong field, wrong kind of company).

Lines starting "Must fit:" are the checks that matter most. A person who clearly fails one is "no"; one you cannot judge on it is "partial".

Rules:
- Missing or blank data is never a reason for "no". If you cannot tell, answer "partial".
- Other names for the same job, and more or less senior versions of it, are never "no" (Head of People is an HR role; Head of Analytics is a data role). "no" means a clearly different job or field.
- Only use the fields given. Do not guess facts like funding, tools used or job changes.
- reason: under 12 words, naming the field that decided it.
- basis (only for "no"): "role" if the job itself is wrong, "company" if the job is fine but the company or field is wrong.
- Return every id you were given, unchanged.

Return JSON only: { "people": [{ "id": "string", "verdict": "match" | "partial" | "no", "reason": "string", "basis": "role" | "company" }] }`;

function toPayload(person: GateInput) {
  return {
    id: person.id,
    title: person.title || undefined,
    headline: person.headline || undefined,
    company: person.company || undefined,
    industry: person.industry || undefined,
    employees: person.employees || undefined,
    location: person.location || undefined,
  };
}

const VERDICTS = new Set<GateVerdict>(["match", "partial", "no"]);

async function judgeChunk(
  chunk: GateInput[],
  criteria: string,
  meta: { userId?: string; searchId?: string }
): Promise<Map<string, GateResult>> {
  const out = new Map<string, GateResult>();
  try {
    const { content } = await aiChat({
      userId: meta.userId,
      searchId: meta.searchId,
      operation: "score",
      system: SYSTEM,
      user: JSON.stringify({ search: criteria, people: chunk.map(toPayload) }),
      jsonMode: true,
      temperature: 0,
      onlyProviders: ["OPENAI"],
    });
    const parsed = JSON.parse(content) as {
      people?: Array<{ id?: string; verdict?: string; reason?: string; basis?: string }>;
    };
    const wanted = new Set(chunk.map((p) => p.id));
    for (const item of parsed.people ?? []) {
      const id = String(item.id ?? "");
      const verdict = String(item.verdict ?? "").toLowerCase() as GateVerdict;
      if (!wanted.has(id) || !VERDICTS.has(verdict)) continue;
      const basis = item.basis === "company" ? "company" : item.basis === "role" ? "role" : undefined;
      out.set(id, {
        verdict,
        reason: String(item.reason ?? "").trim().slice(0, 120),
        ...(verdict === "no" && basis ? { basis } : {}),
      });
    }
  } catch (error) {
    // Fail open: a broken check must cost us leads' quality, never the leads.
    console.warn(
      "[relevanceGate] chunk failed, letting people through:",
      error instanceof Error ? error.message : error
    );
  }
  return out;
}

/**
 * Judge every person. Anyone the model skipped or that failed comes back
 * "unknown", which is always kept.
 */
export async function judgeRelevance(
  people: GateInput[],
  context: LeadScoreContext,
  meta: { userId?: string; searchId?: string } = {}
): Promise<Map<string, GateResult>> {
  const results = new Map<string, GateResult>();
  const criteria = buildGateCriteria(context);
  if (people.length === 0) return results;

  // Nothing to judge against: no call, everyone passes.
  if (!criteria) {
    for (const p of people) results.set(p.id, { verdict: "unknown", reason: "" });
    return results;
  }

  const todo: GateInput[] = [];
  for (const p of people) {
    const hit = cache.get(cacheKey(meta.searchId, p.id));
    if (hit) results.set(p.id, hit);
    else todo.push(p);
  }

  const chunks: GateInput[][] = [];
  for (let i = 0; i < todo.length; i += GATE_CHUNK_SIZE) {
    chunks.push(todo.slice(i, i + GATE_CHUNK_SIZE));
  }
  for (let i = 0; i < chunks.length; i += GATE_CONCURRENCY) {
    const judged = await Promise.all(
      chunks.slice(i, i + GATE_CONCURRENCY).map((c) => judgeChunk(c, criteria, meta))
    );
    for (const map of judged) {
      for (const [id, result] of map) {
        results.set(id, result);
        remember(cacheKey(meta.searchId, id), result);
      }
    }
  }

  for (const p of people) {
    if (!results.has(p.id)) results.set(p.id, { verdict: "unknown", reason: "" });
  }
  return results;
}

/** scoreTitle's value for an exact title. Looser matching protected "Head of HR" via a "Head of" search title. */
const EXACT_TITLE_SCORE = 40;

/** True when the title is exactly one the search itself asked for. */
export function titleMatchesSearch(title: string, searchTitles: string[]): boolean {
  return scoreTitle(title, searchTitles) >= EXACT_TITLE_SCORE;
}

/**
 * The model is not steady on other names for a job (it called "Head of People"
 * not HR in one run of two), so a role-based "no" never drops someone whose
 * title the filters picked on purpose. A company-based "no" still does: a
 * Founder of a bakery is the right job at the wrong company.
 */
function keptByTitle(result: GateResult | undefined, title: string, searchTitles: string[]) {
  return result?.basis !== "company" && titleMatchesSearch(title, searchTitles);
}

export interface GateSummary {
  match: number;
  partial: number;
  no: number;
  unknown: number;
}

/** Keep or drop by verdict. Pure, so the rule is easy to test. */
export function applyRelevanceGate<T extends { id: string; title?: string | null }>(
  people: T[],
  verdicts: Map<string, GateResult>,
  mode: GateMode,
  /** The titles the search asked for. A match here overrules a "no". */
  searchTitles: string[] = []
): { kept: T[]; rejected: T[]; summary: GateSummary; protectedCount: number } {
  const summary: GateSummary = { match: 0, partial: 0, no: 0, unknown: 0 };
  const kept: T[] = [];
  const rejected: T[] = [];
  let protectedCount = 0;
  for (const person of people) {
    const verdict = verdicts.get(person.id)?.verdict ?? "unknown";
    summary[verdict] += 1;
    if (verdict !== "no") {
      kept.push(person);
    } else if (keptByTitle(verdicts.get(person.id), person.title ?? "", searchTitles)) {
      protectedCount += 1;
      kept.push(person);
    } else if (mode === "enforce") {
      rejected.push(person);
    } else {
      kept.push(person);
    }
  }
  return { kept, rejected, summary, protectedCount };
}

/**
 * What gets saved on the lead and shown to the user. "unknown" (not checked, or
 * the check failed) saves nothing. Long dashes become commas: users never see them.
 */
export function fitForLead(result: GateResult | undefined): {
  fitVerdict: string | null;
  fitReason: string | null;
} {
  if (!result || result.verdict === "unknown") return { fitVerdict: null, fitReason: null };
  const reason = result.reason.replace(/\s*[–—]\s*/g, ", ").trim();
  return { fitVerdict: result.verdict, fitReason: reason || null };
}

/** Clear matches unlock before maybes when the unlock budget runs short. */
export function gateRank(verdict: GateVerdict | undefined): number {
  if (verdict === "match") return 0;
  if (verdict === "partial" || verdict === "unknown" || verdict === undefined) return 1;
  return 2;
}
