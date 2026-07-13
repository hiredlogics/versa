import { aiChat } from "./aiRouter";
import { contextForAiParser } from "@/lib/context/userLeadContext";
import { hasAiProvidersConfigured, heuristicParsePrompt } from "@/lib/heuristic-parse";
import { normalizeSearchCriteria } from "@/lib/search-criteria";
import type { SearchCriteria } from "@/lib/types";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

const PARSE_SYSTEM = `You are an expert B2B lead search strategist.

Convert a rough user request into structured Apollo.io search filters.

You are given:
1. The user's saved business context and ideal customer profile (may be null).
2. The user's current lead search prompt.

Rules:
- Use saved context to fill missing details when the prompt is vague.
- The current prompt overrides saved context when it is explicit.
- Do not invent unrelated industries, countries, or titles.
- Respect excluded titles and industries from saved context unless the prompt explicitly requests them.
- Prioritize decision-makers unless user explicitly asks for other roles.
- Return only valid JSON.

Return JSON:
{
  "summary": "string",
  "searchIntent": "string",
  "industry": "string or comma-separated industries (primary first)",
  "country": "string or comma-separated countries (primary first)",
  "companySizeMin": number,
  "companySizeMax": number,
  "openToWork": boolean,
  "requireEmail": boolean,
  "seniorityLevels": ["string"],
  "companyNames": ["string"],
  "companyDomains": ["string"],
  "linkedinUrls": ["string"],
  "excludedTitles": ["string"],
  "excludedIndustries": ["string"],
  "assumptionsUsedFromContext": ["string"],
  "explicitOverridesFromPrompt": ["string"],
  "apollo": {
    "personTitles": ["string"],
    "personLocations": ["string"],
    "qKeywords": "string",
    "employeeRanges": ["string"],
    "includeSimilarTitles": true
  }
}

Apollo rules:
- ONE primary location in personLocations (state OR country, not both)
- qKeywords: 1-2 industry terms only; interests go in searchIntent
- Never put "open to work" in qKeywords`;

function buildUserMessage(prompt: string, leadContext: UserLeadContextDTO | null): string {
  const ctx = contextForAiParser(leadContext);
  return JSON.stringify(
    {
      savedContext: ctx,
      currentPrompt: prompt,
    },
    null,
    2
  );
}

function applyParsedCriteria(
  parsed: Record<string, unknown>,
  userPrompt: string,
  leadContext?: UserLeadContextDTO | null
): SearchCriteria {
  const excludedTitles = [
    ...(Array.isArray(parsed.excludedTitles) ? (parsed.excludedTitles as string[]) : []),
    ...(leadContext?.excludedTitles ?? []),
  ];
  const excludedIndustries = [
    ...(Array.isArray(parsed.excludedIndustries) ? (parsed.excludedIndustries as string[]) : []),
    ...(leadContext?.excludedIndustries ?? []),
  ];

  const criteria = normalizeSearchCriteria(
    parsed as unknown as Parameters<typeof normalizeSearchCriteria>[0],
    userPrompt
  );
  criteria.excludedTitles = [...new Set(excludedTitles.map((t) => t.trim()).filter(Boolean))];
  criteria.excludedIndustries = [
    ...new Set(excludedIndustries.map((t) => t.trim()).filter(Boolean)),
  ];
  criteria.assumptionsUsedFromContext = (parsed.assumptionsUsedFromContext as string[]) ?? [];
  criteria.explicitOverridesFromPrompt = (parsed.explicitOverridesFromPrompt as string[]) ?? [];
  return criteria;
}

export async function parsePromptWithAi(
  userPrompt: string,
  meta?: {
    userId?: string;
    searchId?: string;
    leadContext?: UserLeadContextDTO | null;
  }
): Promise<{ criteria: SearchCriteria; provider: string }> {
  if (!hasAiProvidersConfigured()) {
    return {
      criteria: heuristicParsePrompt(userPrompt, meta?.leadContext),
      provider: "HEURISTIC",
    };
  }

  try {
    const { content, provider } = await aiChat({
      userId: meta?.userId,
      searchId: meta?.searchId,
      operation: "parse",
      system: PARSE_SYSTEM,
      user: buildUserMessage(userPrompt, meta?.leadContext ?? null),
      jsonMode: true,
    });

    const parsed = JSON.parse(content) as Record<string, unknown>;
    return { criteria: applyParsedCriteria(parsed, userPrompt, meta?.leadContext), provider };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no ai providers configured|all ai providers failed/i.test(message)) {
      return {
        criteria: heuristicParsePrompt(userPrompt, meta?.leadContext),
        provider: "HEURISTIC",
      };
    }
    throw error;
  }
}
