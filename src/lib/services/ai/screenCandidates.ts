import { aiChat } from "@/lib/services/ai/aiRouter";
import { hasAiProvidersConfigured } from "@/lib/heuristic-parse";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";
import type { SearchCriteria } from "@/lib/types";

/**
 * LLM screening around the paid Apollo unlock step.
 *
 * Every Apollo unlock costs one credit, so the pre-screen judges candidates on
 * the only free data the search returns (job title + company name) and keeps
 * weak fits away from the paid step. The post-check judges the full unlocked
 * record and keeps weak fits away from the user. Both are advisory: when the
 * AI is unavailable the pipeline continues unscreened rather than failing.
 */

export interface ScreenVerdict {
  score: number;
  pass: boolean;
  reason: string;
}

export interface PrescreenCandidate {
  id: string;
  title: string;
  company: string;
}

export interface PostcheckLead extends PrescreenCandidate {
  industry: string | null;
  employees: number | null;
  location: string | null;
}

interface ScreenMeta {
  prompt: string;
  criteria: SearchCriteria;
  userId?: string;
  searchId?: string;
}

const CHUNK = 60;

function clampScore(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function readThreshold(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

export function isLlmScreenEnabled(): boolean {
  const raw = (process.env.LEAD_LLM_SCREEN || "true").trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return hasAiProvidersConfigured();
}

export function prescreenMinScore(): number {
  return readThreshold("LEAD_PRESCREEN_MIN_SCORE", 60);
}

export function postcheckMinScore(): number {
  return readThreshold("LEAD_POSTCHECK_MIN_SCORE", 60);
}

/**
 * Parse the model's JSON into verdicts for every requested id. Ids the model
 * skipped get a neutral passing score: an omission is not evidence of a bad fit.
 */
export function parseVerdicts(
  content: string,
  ids: string[],
  minScore: number
): Map<string, ScreenVerdict> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { verdicts?: unknown }).verdicts)
      ? ((parsed as { verdicts: unknown[] }).verdicts)
      : [];

  const byId = new Map<string, ScreenVerdict>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; score?: unknown; reason?: unknown };
    const id = typeof row.id === "string" ? row.id : null;
    const score = clampScore(row.score);
    if (!id || score === null) continue;
    byId.set(id, {
      score,
      pass: score >= minScore,
      reason: typeof row.reason === "string" ? row.reason.slice(0, 160) : "",
    });
  }

  for (const id of ids) {
    if (!byId.has(id)) byId.set(id, { score: 50, pass: 50 >= minScore, reason: "not rated" });
  }
  return byId;
}

function describeRequest(meta: ScreenMeta): string {
  const c = meta.criteria;
  const parts = [
    `Original request: "${meta.prompt}"`,
    c.jobTitles?.length ? `Wanted roles: ${c.jobTitles.join(", ")}` : null,
    c.industry && !/^(any|n\/a)$/i.test(c.industry) ? `Wanted industry: ${c.industry}` : "Industry: not specified (do not judge industry)",
    c.industryTags?.length ? `Wanted industries, as keyword tags: ${c.industryTags.join(", ")}` : null,
    c.country ? `Wanted location: ${c.country}` : null,
    c.companySizeMin || c.companySizeMax
      ? `Wanted company size: ${c.companySizeMin || 1} to ${c.companySizeMax || "any"} employees`
      : null,
    c.excludedIndustries?.length ? `Excluded industries: ${c.excludedIndustries.join(", ")}` : null,
    c.excludedTitles?.length ? `Excluded roles: ${c.excludedTitles.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

const PRESCREEN_SYSTEM = `You screen B2B sales leads BEFORE the company pays to unlock them.
You only see each person's job title and employer name. Score 0-100 how likely each person matches the request.
Rules:
- The role must match the wanted roles in function and seniority (e.g. "VP Sales" matches "Head of Sales"; "Sales Associate" does not).
- Judge the industry from the employer name and what you know about that company. A name that clearly signals a different industry (a car dealer, a bank, a hospital) scores low. A neutral name you cannot place scores around 55-65, never high.
- "Companies in industry X" means businesses whose main product or service is X. Communities, societies, associations, conferences, events, media, recruiters, training providers, marketing agencies and banks that merely serve or mention X are NOT in industry X and score below 40, unless the request asks for them.
- When the request names no industry, ignore industry entirely.
- When the request lists specific industries, a company you cannot place in one of them from its name and your knowledge scores below 50. Generic words in a name ("AI", "Tech", "Labs", "Solutions") are not evidence of the wanted industry.
- Be strict: credits are spent on everyone you pass. Reserve 80+ for clear fits.
Return JSON only: {"verdicts":[{"id":"...","score":0-100,"reason":"<= 12 words"}]} with one entry per id.`;

const POSTCHECK_SYSTEM = `You do the final quality check on B2B sales leads AFTER they were unlocked.
You now see job title, employer, employer industry, employee count and location. Score 0-100 how well each lead matches the request.
Rules:
- Role must match in function and seniority.
- Industry must fit the wanted industry. The industry label is a coarse provider tag: "information technology & services" and "computer software" also cover security, data and SaaS vendors, so when the label is generic, let the employer name and what you know about the company decide (e.g. "Cyberhill" with an IT-services label is a plausible cybersecurity firm). If the employer name itself contains the wanted industry term (e.g. "FinTech Automation" for fintech), treat industry as a match unless the name shows it is media, a community, an event or an agency.
- "Companies in industry X" means businesses whose main product or service is X. Communities, societies, associations, conferences, events, media, recruiters, training providers, marketing agencies and banks that merely serve or mention X are NOT in industry X and score below 40, unless the request asks for them. Judge this from the employer name and industry label together.
- Employee count and location must fall inside the wanted ranges when they are given.
- A clear contradiction on any hard constraint scores below 40. Missing data is not a contradiction.
Return JSON only: {"verdicts":[{"id":"...","score":0-100,"reason":"<= 12 words"}]} with one entry per id.`;

async function screen<T extends { id: string }>(
  kind: "prescreen" | "postcheck",
  system: string,
  items: T[],
  minScore: number,
  meta: ScreenMeta
): Promise<Map<string, ScreenVerdict> | null> {
  if (items.length === 0) return new Map();
  if (!isLlmScreenEnabled()) return null;

  const verdicts = new Map<string, ScreenVerdict>();
  const started = Date.now();
  try {
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const { content } = await aiChat({
        userId: meta.userId,
        searchId: meta.searchId,
        operation: "score",
        system,
        user: `${describeRequest(meta)}\n\nCandidates (JSON):\n${JSON.stringify(chunk)}`,
        jsonMode: true,
        temperature: 0,
      });
      for (const [id, verdict] of parseVerdicts(content, chunk.map((c) => c.id), minScore)) {
        verdicts.set(id, verdict);
      }
    }
  } catch (error) {
    logLeadFetch(`${kind}_skipped`, {
      searchId: meta.searchId,
      reason: error instanceof Error ? error.message.slice(0, 200) : String(error),
      candidates: items.length,
    });
    return null;
  }

  const passed = [...verdicts.values()].filter((v) => v.pass).length;
  logLeadFetch(kind, {
    searchId: meta.searchId,
    candidates: items.length,
    passed,
    dropped: items.length - passed,
    minScore,
    durationMs: Date.now() - started,
  });
  return verdicts;
}

/** Free-data screen: title + company only. Null means "AI unavailable, do not filter". */
export function prescreenCandidates(
  candidates: PrescreenCandidate[],
  meta: ScreenMeta
): Promise<Map<string, ScreenVerdict> | null> {
  return screen("prescreen", PRESCREEN_SYSTEM, candidates, prescreenMinScore(), meta);
}

/** Full-data check after unlock. Null means "AI unavailable, do not filter". */
export function verifyUnlockedLeads(
  leads: PostcheckLead[],
  meta: ScreenMeta
): Promise<Map<string, ScreenVerdict> | null> {
  return screen("postcheck", POSTCHECK_SYSTEM, leads, postcheckMinScore(), meta);
}
