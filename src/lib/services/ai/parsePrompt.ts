import { aiChat } from "./aiRouter";
import { contextForAiParser } from "@/lib/context/userLeadContext";
import { hasAiProvidersConfigured, heuristicParsePrompt } from "@/lib/heuristic-parse";
import { normalizeSearchCriteria } from "@/lib/search-criteria";
import { logLeadFetch } from "@/lib/services/leads/fetchLog";
import { aiParsePromptOutputSchema } from "@/lib/validations/search-criteria";
import type { SearchCriteria } from "@/lib/types";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

const PARSE_SYSTEM = `You are an expert B2B lead search strategist for Apollo.io.

Your job has TWO phases — do them in order:

PHASE 1 — Understand the FULL current user prompt ONLY
- Read the entire prompt. Do not drop topics.
- Identify: WHO (roles), WHERE (location), INDUSTRY / DOMAIN, WHAT THEY CARE ABOUT (needs like automation, AI, hiring…), and company size if stated.
- Do NOT use any saved ICP / onboarding / past-search context. Every search is fully dynamic from this prompt alone.
- Put the COMPLETE meaning into "searchIntent" and "summary" as plain English.
  Example prompt: "Need automation. people in real estate in the US"
  → searchIntent: "Decision makers at real estate companies in the US who may need automation"

PHASE 2 — Convert that understanding into accurate Apollo filters
- personTitles: 2–5 titles that match THAT industry (not generic tech titles unless the industry is tech).
  Real estate examples: ["Broker","Managing Broker","Property Manager","Real Estate Investor","Founder","CEO"]
  SaaS examples: ["CEO","Founder","CTO","VP Sales"]
  CRITICAL: If industry is Real Estate / property / brokerage, NEVER use CTO, VP Engineering, Head of Product, or other software titles unless the user explicitly asked for tech roles.
- personLocations: exactly the places the user listed (max 3). Never pair a country with one of its own states/cities (no ["California","United States"]).
- qKeywords: the INDUSTRY / domain phrase only (keep multi-word intact).
  Good: "real estate" | "property management" | "healthcare"
  Bad: "automation, real" | "automation real estate AI" | cutting words mid-phrase
  Put needs like "automation", "AI", "chatbots" ONLY in searchIntent (used later for ranking) — never in qKeywords.
- employeeRanges: ONLY Apollo standard buckets with a COMMA:
  "1,10" | "11,50" | "51,200" | "201,500" | "501,1000" | "1001,5000"
  Never invent "20,43" or use hyphens.
  If the prompt says ~20–50 people → ["11,50"]. If 50–200 → ["51,200"]. If vague → ["11,50","51,200","201,500"].
- industry: primary industry name (e.g. "Real Estate")
- openToWork: true ONLY if the user wants job seekers / "open to work" / between jobs.
  CRITICAL: Apollo has NO open-to-work filter. Still emit tight personTitles + personLocations + qKeywords.
  Never omit titles or keywords just because openToWork is true — that balloons the Apollo pool.
  For HR roles use titles like ["HR Manager","Human Resources Manager","Head of People"], not bare "HR".
  For New York / NY / NYC use personLocations: ["New York"] (not United States).
- Do not invent unrelated industries, countries, or titles.
- Respect excluded titles/industries only when the prompt itself states them.

Return ONLY valid JSON:
{
  "summary": "string",
  "searchIntent": "full intent including industry AND needs",
  "industry": "primary industry",
  "country": "primary country",
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
  "assumptionsUsedFromContext": [],
  "explicitOverridesFromPrompt": ["string"],
  "apollo": {
    "personTitles": ["string"],
    "personLocations": ["string"],
    "qKeywords": "industry phrase only",
    "employeeRanges": ["11,50"],
    "includeSimilarTitles": true
  }
}`;

function buildUserMessage(prompt: string, leadContext: UserLeadContextDTO | null): string {
  // Prompt-only mode: never send saved ICP — each search is fully dynamic.
  if (!leadContext) {
    return JSON.stringify(
      {
        instruction:
          "Derive ALL Apollo filters only from currentPrompt. Ignore any prior ICP. Do not put needs (automation/AI) into qKeywords.",
        currentPrompt: prompt,
      },
      null,
      2
    );
  }

  const ctx = contextForAiParser(leadContext);
  return JSON.stringify(
    {
      instruction:
        "First understand the full currentPrompt. Then emit Apollo filters that match the FULL intent — especially industry. Do not put needs (automation/AI) into qKeywords.",
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
  criteria.assumptionsUsedFromContext = leadContext
    ? ((parsed.assumptionsUsedFromContext as string[]) ?? [])
    : [];
  criteria.explicitOverridesFromPrompt = (parsed.explicitOverridesFromPrompt as string[]) ?? [];
  return criteria;
}

function heuristicResult(
  userPrompt: string,
  leadContext: UserLeadContextDTO | null | undefined,
  reason: string
): { criteria: SearchCriteria; provider: string; parseMode: string } {
  logLeadFetch("parse_heuristic", { reason, promptLen: userPrompt.length });
  return {
    criteria: heuristicParsePrompt(userPrompt, leadContext),
    provider: "HEURISTIC",
    parseMode: reason,
  };
}

export async function parsePromptWithAi(
  userPrompt: string,
  meta?: {
    userId?: string;
    searchId?: string;
    leadContext?: UserLeadContextDTO | null;
  }
): Promise<{ criteria: SearchCriteria; provider: string; parseMode: string }> {
  if (!hasAiProvidersConfigured()) {
    return heuristicResult(userPrompt, meta?.leadContext, "no_ai_providers");
  }

  try {
    const { content, provider } = await aiChat({
      userId: meta?.userId,
      searchId: meta?.searchId,
      operation: "parse",
      system: PARSE_SYSTEM,
      user: buildUserMessage(userPrompt, meta?.leadContext ?? null),
      jsonMode: true,
      temperature: 0,
    });

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (parseError) {
      logLeadFetch("parse_invalid_json", {
        provider,
        searchId: meta?.searchId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        contentPreview: content.slice(0, 200),
      });
      return heuristicResult(userPrompt, meta?.leadContext, "invalid_json_fallback");
    }

    const validated = aiParsePromptOutputSchema.safeParse(raw);
    if (!validated.success) {
      logLeadFetch("parse_schema_invalid", {
        provider,
        searchId: meta?.searchId,
        issues: validated.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return heuristicResult(userPrompt, meta?.leadContext, "schema_invalid_fallback");
    }

    const criteria = applyParsedCriteria(
      validated.data as Record<string, unknown>,
      userPrompt,
      meta?.leadContext
    );

    logLeadFetch("parse_ok", {
      provider,
      searchId: meta?.searchId,
      parseMode: "ai",
      titles: criteria.apollo?.personTitles?.slice(0, 5) ?? [],
      locations: criteria.apollo?.personLocations ?? [],
      qKeywords: criteria.apollo?.qKeywords ?? null,
      employeeRanges: criteria.apollo?.employeeRanges ?? null,
      industry: criteria.industry,
      openToWork: Boolean(criteria.openToWork),
    });

    return { criteria, provider, parseMode: "ai" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no ai providers configured|all ai providers failed/i.test(message)) {
      return heuristicResult(userPrompt, meta?.leadContext, "all_ai_providers_failed");
    }
    logLeadFetch("parse_error", {
      searchId: meta?.searchId,
      error: message,
    });
    throw error;
  }
}
