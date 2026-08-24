import { hasAiProvidersConfigured } from "@/lib/heuristic-parse";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";
import {
  needsClarification,
  type ClarificationNeed,
  type ClarificationQuestion,
  type ClarificationQuestionId,
} from "@/lib/clarifyPrompt";
import type { SearchCriteria } from "@/lib/types";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";
import { aiChat } from "./aiRouter";

const SYSTEM = `You screen lead-search prompts before any paid contact credits are spent.

The search engine can only filter people by: job titles, person location (city/state/country), company size, industry, and free-text keywords.
It CANNOT filter by gender, age, ethnicity, visa status, shift/hours availability, salary, or "open to work" status.

Decide whether the prompt is specific enough to run. Ask about a field ONLY when it is genuinely missing or too vague to build a filter, and never ask about something the prompt already answers.

Always ask "location" when the prompt names no city, state, or country: an unscoped search wastes contact credits on the wrong region.

Ask at most 3 questions. Each question needs 4-6 concrete, tappable options tailored to THIS prompt (real job titles, real places), never generic placeholders.

Question ids you may use:
- "roles": which job titles to target
- "location": where to search
- "count": how many leads to pull now

Return JSON only:
{
  "needsClarification": true | false,
  "unsupported": ["short plain-English note about any part of the prompt that cannot be filtered"],
  "questions": [
    {
      "id": "roles",
      "prompt": "Which roles should we target?",
      "options": ["Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack Engineer"],
      "allowMultiple": true
    }
  ]
}

If the prompt is already specific enough, return needsClarification false with an empty questions array.`;

type AiClarifyResponse = {
  needsClarification?: boolean;
  unsupported?: unknown;
  questions?: Array<{
    id?: string;
    prompt?: string;
    options?: unknown;
    allowMultiple?: boolean;
  }>;
};

const VALID_IDS: ClarificationQuestionId[] = ["location", "roles", "count"];

function asCleanStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const clean = entry.trim();
    const key = clean.toLowerCase();
    if (!clean || clean.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function customPlaceholderFor(id: ClarificationQuestionId): string {
  if (id === "location") return "Another city, state, or country…";
  if (id === "roles") return "Another job title…";
  return "A specific number…";
}

function toQuestions(raw: AiClarifyResponse): ClarificationQuestion[] {
  if (!Array.isArray(raw.questions)) return [];
  const byId = new Map<ClarificationQuestionId, ClarificationQuestion>();

  for (const entry of raw.questions) {
    const id = String(entry?.id || "").trim().toLowerCase() as ClarificationQuestionId;
    if (!VALID_IDS.includes(id) || byId.has(id)) continue;

    const options = asCleanStrings(entry?.options, 7);
    const prompt = String(entry?.prompt || "").trim();
    if (!prompt || options.length < 2) continue;

    byId.set(id, {
      id,
      prompt,
      options,
      allowMultiple: id === "count" ? false : entry?.allowMultiple !== false,
      customPlaceholder: customPlaceholderFor(id),
    });
  }

  return [...byId.values()].slice(0, 3);
}

function buildMessage(unsupported: string[]): string {
  const base = "A couple of quick questions so I only spend your lead credits on the right people.";
  if (unsupported.length === 0) return base;
  return `${base} Heads up: ${unsupported.join(" ")}`;
}

/**
 * Ask the AI which details are missing from THIS prompt, so the questions and
 * their options fit what the user actually typed. Falls back to the rule-based
 * check when AI is unavailable or returns something unusable.
 */
export async function clarifyWithAi(
  prompt: string,
  criteria: SearchCriteria,
  options?: {
    leadContext?: UserLeadContextDTO | null;
    userId?: string;
    requestedLeadCount?: number;
  }
): Promise<ClarificationNeed> {
  const fallback = needsClarification(criteria, prompt);
  if (!hasAiProvidersConfigured()) return fallback;

  const context = options?.leadContext;
  const contextBlock = context
    ? `Saved buyer context (use for better option suggestions, do not ask about it): business=${
        context.businessDescription ?? "n/a"
      }; target titles=${(context.targetTitles ?? []).join(", ") || "n/a"}; target countries=${
        (context.targetCountries ?? []).join(", ") || "n/a"
      }`
    : "No saved buyer context.";

  const user = `Prompt: "${prompt.slice(0, 1200)}"

Filters parsed so far:
- titles: ${(criteria.apollo?.personTitles ?? []).join(", ") || "none"}
- locations: ${(criteria.apollo?.personLocations ?? []).join(", ") || "none"}
- keywords: ${criteria.apollo?.qKeywords ?? "none"}
- industry: ${criteria.industry ?? "none"}
- requested lead count: ${options?.requestedLeadCount ?? "not stated"}

${contextBlock}`;

  try {
    const { content, provider } = await aiChat({
      operation: "parse",
      userId: options?.userId,
      system: SYSTEM,
      user,
      jsonMode: true,
      temperature: 0.1,
    });

    const parsed = JSON.parse(content) as AiClarifyResponse;
    const questions = toQuestions(parsed);
    const unsupported = asCleanStrings(parsed.unsupported, 3);

    logLeadFetch("clarify_ai", {
      userId: options?.userId,
      provider,
      needsClarification: Boolean(parsed.needsClarification) && questions.length > 0,
      questionIds: questions.map((q) => q.id),
      unsupported,
    });

    if (!parsed.needsClarification || questions.length === 0) {
      return {
        needsClarification: false,
        questions: [],
        message: unsupported.length > 0 ? buildMessage(unsupported) : "",
        requestedLeadCount: fallback.requestedLeadCount,
      };
    }

    return {
      needsClarification: true,
      questions,
      message: buildMessage(unsupported),
      requestedLeadCount: fallback.requestedLeadCount,
    };
  } catch (error) {
    console.warn(
      "[clarifyWithAi] falling back to rule-based questions:",
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}
