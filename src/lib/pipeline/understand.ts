import { z } from "zod";
import { aiChat } from "@/lib/services/ai/aiRouter";
import type { Brief, BriefGap, Question, Understanding } from "./types";

/**
 * One AI call turns a prompt into a Brief, or into questions about what it
 * genuinely could not work out. Guessing is never an option: a guessed field
 * spends the user's credits on the wrong people.
 */

export const VALID_EMPLOYEE_RANGES = [
  "1,10",
  "11,50",
  "51,200",
  "201,500",
  "501,1000",
  "1001,5000",
] as const;

/** Wording that means "these people should be looking for a job". */
const JOB_SEEKING_INTENT =
  /open\s*to\s*work|looking for (a )?(job|work|new role)|job\s*seek|between jobs|unemployed|laid off|actively looking|available for hire/i;

/** After this many rounds on the same gap, stop asking and say what we did. */
export const MAX_CLARIFY_ROUNDS = 3;
export const DEFAULT_TOTAL = 100;

const SYSTEM = `You prepare paid B2B people searches. Do two jobs in one pass: extract what the prompt says, and report what it does not.

The search can filter on: job titles, ONE person location, industry, company headcount, and free-text keywords.
It CANNOT filter on gender, age, ethnicity, visa status, shift or hours availability, salary, or "open to work" status.

Rules:
- location: ONE place only — country OR state OR city, never two. Never widen a city to its country.
- industry: the domain phrase kept whole — "real estate", not "real".
- titles: 2-5 real job titles, matched to the stated industry. Real estate gets Broker or Property Manager, not CTO.
- employeeRanges: only "1,10" "11,50" "51,200" "201,500" "501,1000" "1001,5000". Never invent "20,43", never use hyphens.
- signals: needs and timing cues such as "automation" or "hiring now". These are for ranking and the why column ONLY — never put them in titles or industry, it wrecks recall.
- requestedTotal: a NUMBER, not a string. Use 0 when the prompt does not say how many.
- Questions must quote what the user actually said: "You mentioned recruiters — which country?", not "What is your target location?". Give 2-4 concrete tappable options, never "Other". Quantity always offers ["100","250","500","1000"].

Return JSON only:
{
  "brief": {
    "intent": "string",
    "titles": ["string"],
    "location": "string or null",
    "industry": "string or null",
    "employeeRanges": ["11,50"],
    "signals": ["string"],
    "excludeTitles": [],
    "excludeIndustries": [],
    "requestedTotal": 0
  },
  "gaps": ["titles" | "location" | "quantity" | "industry"],
  "questions": [{ "id": "location", "prompt": "string", "options": ["string"], "allowMultiple": false }]
}

Guessing is worse than asking, because a wrong search spends the user's money.`;

const questionSchema = z.object({
  id: z.enum(["titles", "location", "quantity", "industry"]),
  prompt: z.string().min(1),
  options: z.array(z.string()).default([]),
  allowMultiple: z.boolean().optional(),
});

// Strict types on purpose: a model returning "500" must not silently coerce to
// a number, and must not coerce to 0 either — both hide the real problem.
const responseSchema = z.object({
  brief: z.object({
    intent: z.string().optional().nullable(),
    titles: z.array(z.string()).optional().nullable(),
    location: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    employeeRanges: z.array(z.string()).optional().nullable(),
    signals: z.array(z.string()).optional().nullable(),
    excludeTitles: z.array(z.string()).optional().nullable(),
    excludeIndustries: z.array(z.string()).optional().nullable(),
    requestedTotal: z.number().optional().nullable(),
  }),
  gaps: z.array(z.string()).optional().nullable(),
  questions: z.array(questionSchema).optional().nullable(),
});

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/** Accepts "500", "500 leads", 500. Rejects "a few", "", null. */
export function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value !== "string") return null;
  const match = value.replace(/[, ]/g, "").match(/\d+/);
  if (!match) return null;
  const parsed = parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Re-derived from the brief, never taken from the model. A model that reports
 * `gaps: []` while leaving location null must still be blocked from starting a
 * paid search.
 */
export function actualGaps(brief: Partial<Brief>): BriefGap[] {
  const gaps: BriefGap[] = [];
  if (!brief.titles?.length) gaps.push("titles");
  if (!brief.location) gaps.push("location");
  if (!brief.requestedTotal || brief.requestedTotal <= 0) gaps.push("quantity");
  return gaps;
}

const FALLBACK_QUESTIONS: Record<BriefGap, Question> = {
  titles: {
    id: "titles",
    prompt: "Which job titles should we target?",
    options: ["Founder / CEO", "CTO", "Sales Manager", "Software Engineer"],
    allowMultiple: true,
  },
  location: {
    id: "location",
    prompt: "Where should we search? Pick one place.",
    options: ["United States", "United Kingdom", "Canada", "Remote"],
  },
  quantity: {
    id: "quantity",
    prompt: "How many leads should we pull?",
    options: ["100", "250", "500", "1000"],
  },
  industry: {
    id: "industry",
    prompt: "Which industry should we focus on?",
    options: ["Software", "Real estate", "Healthcare", "Finance"],
  },
};

function questionsFor(gaps: BriefGap[], fromModel: Question[]): Question[] {
  const byId = new Map(fromModel.map((q) => [q.id, q]));
  return gaps.map((gap) => {
    const supplied = byId.get(gap);
    if (!supplied) return FALLBACK_QUESTIONS[gap];
    const options = cleanList(supplied.options, 4);
    return {
      id: gap,
      prompt: supplied.prompt,
      options: options.length >= 2 ? options : FALLBACK_QUESTIONS[gap].options,
      allowMultiple: gap === "quantity" ? false : supplied.allowMultiple,
    };
  });
}

function askEverything(brief: Partial<Brief>): Understanding {
  const gaps: BriefGap[] = ["titles", "location", "quantity"];
  return {
    status: "needs_clarification",
    brief,
    gaps,
    questions: gaps.map((gap) => FALLBACK_QUESTIONS[gap]),
  };
}

export interface UnderstandInput {
  prompt: string;
  answers?: Record<string, unknown> | null;
  /** How many times we have already asked. Prevents an inescapable loop. */
  round?: number;
}

export async function understand(
  input: UnderstandInput,
  meta?: { userId?: string; searchId?: string }
): Promise<Understanding> {
  const answers = input.answers ?? {};
  const answerText = Object.entries(answers)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join("\n");

  const user = answerText
    ? `Original prompt: "${input.prompt}"\n\nThe user has since answered:\n${answerText}`
    : `Prompt: "${input.prompt}"`;

  let parsed: z.infer<typeof responseSchema>;
  try {
    const { content } = await aiChat({
      operation: "parse",
      userId: meta?.userId,
      searchId: meta?.searchId,
      system: SYSTEM,
      user,
      jsonMode: true,
      temperature: 0,
    });
    parsed = responseSchema.parse(JSON.parse(content));
  } catch {
    // Never fall back to a keyword heuristic: that is how a vague prompt became
    // a wrong paid search. Ask instead.
    return askEverything({ intent: input.prompt });
  }

  const raw = parsed.brief;
  const brief: Partial<Brief> = {
    intent: cleanText(raw.intent) ?? input.prompt,
    titles: cleanList(raw.titles, 5),
    location: cleanText(raw.location),
    industry: cleanText(raw.industry),
    employeeRanges: cleanList(raw.employeeRanges, 6).filter((range) =>
      (VALID_EMPLOYEE_RANGES as readonly string[]).includes(range)
    ),
    signals: cleanList(raw.signals, 6),
    excludeTitles: cleanList(raw.excludeTitles, 10),
    excludeIndustries: cleanList(raw.excludeIndustries, 10),
    requestedTotal: typeof raw.requestedTotal === "number" ? Math.trunc(raw.requestedTotal) : 0,
  };

  // Detected from the prompt rather than asked of the model: "open to work" is
  // not a filter the provider offers, so this is a post-fetch narrowing on what
  // people say about themselves, and the user must be told that.
  brief.jobSeekingOnly = JOB_SEEKING_INTENT.test(`${input.prompt} ${answerText}`);

  // The user may have answered the quantity question directly; trust that over
  // whatever the model echoed back.
  const answeredQuantity = parseQuantity(answers.quantity);
  if (answeredQuantity) brief.requestedTotal = answeredQuantity;

  const gaps = actualGaps(brief);

  if (gaps.length === 0) {
    return { status: "ready", brief: brief as Brief };
  }

  const round = input.round ?? 0;
  if (round >= MAX_CLARIFY_ROUNDS) {
    // Quantity has a safe default; who and where do not, and inventing them is
    // exactly the failure this gate exists to prevent.
    if (gaps.length === 1 && gaps[0] === "quantity") {
      return {
        status: "ready",
        brief: { ...brief, requestedTotal: DEFAULT_TOTAL } as Brief,
        note: `I'll start with ${DEFAULT_TOTAL} leads — ask for more once you've seen them.`,
      };
    }
    return {
      status: "needs_clarification",
      brief,
      gaps,
      questions: questionsFor(gaps, parsed.questions ?? []),
      exhausted: true,
      note: "I still can't tell who or where to search for. Try rewriting the prompt with a job title and a place, for example \"HR managers in Toronto\".",
    };
  }

  return {
    status: "needs_clarification",
    brief,
    gaps,
    questions: questionsFor(gaps, parsed.questions ?? []),
  };
}
