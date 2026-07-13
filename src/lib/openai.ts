import OpenAI from "openai";
import type { SearchCriteria, LeadScoreContext, LeadScoreResult } from "./types";
import { heuristicScoreLeadsBatch } from "./heuristic-scoring";

function getAIClient(): { client: OpenAI; model: string; fastModel: string; provider: string } {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const key = groqKey || openaiKey;

  if (!key) {
    throw new Error(
      "No AI API key configured. Add GROQ_API_KEY or OPENAI_API_KEY to your .env.local file."
    );
  }

  if (key.startsWith("gsk_") || groqKey) {
    return {
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://api.groq.com/openai/v1",
      }),
      model: "llama-3.3-70b-versatile",
      fastModel: "llama-3.1-8b-instant",
      provider: "Groq",
    };
  }

  return {
    client: new OpenAI({ apiKey: key }),
    model: "gpt-4o-mini",
    fastModel: "gpt-4o-mini",
    provider: "OpenAI",
  };
}

function isDailyLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("tokens per day") || message.includes("TPD");
}

function parseRetryDelayMs(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/try again in (\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  return 3000;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) return error.status === 429;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.toLowerCase().includes("rate limit");
}

async function chatWithRetry(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  retries = 3
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (error) {
      // Daily token limit — don't retry (wait would be 14+ minutes)
      if (isDailyLimitError(error)) {
        throw error;
      }
      if (isRateLimitError(error) && attempt < retries - 1) {
        const waitMs = Math.min(parseRetryDelayMs(error) * (attempt + 1), 8000);
        console.log(`[ai] Rate limited — retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error("AI request failed after retries");
}

import { normalizeSearchCriteria } from "./search-criteria";

const PARSE_PROMPT_SYSTEM = `You convert natural language lead-search requests into Apollo.io API search filters.

READ the user's message carefully. Extract THEIR specific intent — titles, locations, industries, interests, company size. Do NOT apply generic templates.

Apollo.io accepts these filters (derive from the user prompt):
- personTitles: job titles (1-5)
- personLocations: ONE best location — prefer state/city over country (use "California" NOT both "California" and "United States")
- qKeywords: 1-2 INDUSTRY or COMPANY-TYPE words ONLY (e.g. "e-commerce", "healthcare", "SaaS"). Put interest topics like "AI chatbots" in searchIntent, NOT qKeywords
- employeeRanges: Apollo buckets like ["11,50","51,200"] from company size
- includeSimilarTitles: true

Also return:
- searchIntent: full description including interests/topics for ranking (e.g. "marketing directors at e-commerce companies interested in AI chatbots")
- industry: primary industry label for display
- country: primary country for display
- companySizeMin / companySizeMax: numbers from prompt (default 10-500 if unspecified)
- openToWork: true ONLY if user wants job seekers / "open to work" / between jobs
- requireEmail: true only if user explicitly wants email/contact info

Examples:
- "Marketing directors at e-commerce in California interested in AI chatbots" → personTitles: ["Marketing Director","Director of Marketing"], personLocations: ["California"], qKeywords: "e-commerce", searchIntent: "marketing directors at e-commerce companies interested in AI chatbots"
- "CTOs interested in AI automation in the US" → personTitles: ["CTO","VP Engineering"], personLocations: ["United States"], qKeywords: "software", searchIntent: "CTOs interested in AI automation"
- "Healthcare founders in Texas 50-200 employees" → personTitles: ["Founder","CEO"], personLocations: ["Texas"], qKeywords: "healthcare", employeeRanges: ["51,200"]

Return ONLY valid JSON:
{
  "summary": "string",
  "searchIntent": "string",
  "industry": "string",
  "country": "string",
  "companySizeMin": number,
  "companySizeMax": number,
  "openToWork": boolean,
  "requireEmail": boolean,
  "apollo": {
    "personTitles": ["string"],
    "personLocations": ["string"],
    "qKeywords": "string",
    "employeeRanges": ["string"],
    "includeSimilarTitles": true
  }
}`;

export async function parseSearchPrompt(userPrompt: string): Promise<SearchCriteria> {
  const { client, fastModel } = getAIClient();

  const response = await chatWithRetry(client, {
    model: fastModel,
    messages: [
      { role: "system", content: PARSE_PROMPT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to parse search prompt");
  }

  const parsed = JSON.parse(content);
  const criteria = normalizeSearchCriteria(parsed, userPrompt);

  console.log(`[ai] Parsed search intent: ${criteria.searchIntent}`);
  console.log(`[ai] Apollo filters from prompt:\n${JSON.stringify(criteria.apollo, null, 2)}`);

  return criteria;
}

export type { LeadScoreResult } from "./types";

type LeadInput = {
  name: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  location: string;
  hasEmail?: boolean;
};

function buildScorePrompt(context?: LeadScoreContext): string {
  if (context?.openToWork) {
    return `You are a recruiting expert helping find professionals to contact about job opportunities.

IMPORTANT: Apollo does NOT have "open to work" status. Most leads are currently employed — that is EXPECTED and OK.

Score EACH lead 1-10 based on:
1. Role/title match (Software Engineer, Developer, PM, Designer, Consultant = good fit)
2. hasEmail=true → score at least 6; no email → max score 5
3. Mid-size companies (11-500 employees) = good
4. US location match
5. ONLY give score 8-10 if title explicitly shows: Open to Work, Seeking, Available, Freelance, Consultant, Between Roles, Former [Company]
6. Employed professionals in matching roles should score 6-7 (they are still valid outreach targets)

Do NOT score most leads below 5 unless completely wrong role or location.

Return ONLY valid JSON:
{ "leads": [{ "index": 0, "score": 7, "reasoning": "...", "priority": "High"|"Medium"|"Low" }] }
Include ALL leads.`;
  }

  return `You are a senior B2B lead qualification expert.

Score EACH lead 1-10 based on:
1. Decision-making authority (CEO, CTO, Founder = higher)
2. Company growth potential
3. Likelihood to buy software/AI services
4. Company size fit (10-500 ideal)
5. Industry alignment
6. Has email for outreach (boost +1 if hasEmail is true)

IMPORTANT: Leads WITH email should score higher.

Return ONLY valid JSON:
{
  "leads": [{ "index": 0, "score": 8, "reasoning": "...", "priority": "High"|"Medium"|"Low" }]
}
Include ALL leads.`;
}

async function scoreLeadsChunk(
  leads: LeadInput[],
  startIndex: number,
  context?: LeadScoreContext
): Promise<LeadScoreResult[]> {
  const { client, fastModel } = getAIClient();
  const scorePrompt = buildScorePrompt(context);

  const payload = leads.map((lead, i) => ({
    index: startIndex + i,
    title: lead.title,
    company: lead.company,
    employees: lead.employees,
    hasEmail: lead.hasEmail ?? false,
  }));

  const response = await chatWithRetry(client, {
    model: fastModel,
    messages: [
      { role: "system", content: scorePrompt },
      { role: "user", content: JSON.stringify(payload) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to score leads");
  }

  const parsed = JSON.parse(content) as {
    leads?: Array<{
      index: number;
      score: number;
      reasoning: string;
      priority: "High" | "Medium" | "Low";
    }>;
  };

  const defaults: LeadScoreResult[] = leads.map(() => ({
    score: 5,
    reasoning: "No score returned",
    priority: "Medium" as const,
  }));

  for (const item of parsed.leads || []) {
    const localIndex = item.index - startIndex;
    if (localIndex >= 0 && localIndex < leads.length) {
      defaults[localIndex] = {
        score: Math.min(10, Math.max(1, item.score || 5)),
        reasoning: item.reasoning || "No reasoning provided",
        priority: item.priority || "Medium",
      };
    }
  }

  return defaults;
}

export async function scoreLeadsBatch(
  leads: LeadInput[],
  onProgress?: (current: number, total: number) => void,
  context?: LeadScoreContext
): Promise<LeadScoreResult[]> {
  if (leads.length === 0) return [];

  const scoringMode = (process.env.SCORING_MODE || "heuristic").toLowerCase();
  const maxAiScore = Math.max(
    0,
    parseInt(process.env.AI_MAX_SCORE_COUNT || "0", 10)
  );

  // Fast rule-based scoring — no API tokens (default for Groq free tier)
  const results = heuristicScoreLeadsBatch(leads, context);
  onProgress?.(leads.length, leads.length);

  if (scoringMode === "heuristic" || maxAiScore === 0) {
    return results;
  }

  // Optional: AI refine top N candidates only (hybrid / ai modes)
  const topIndices = leads
    .map((lead, i) => ({
      i,
      score: results[i].score,
      hasEmail: lead.hasEmail ?? false,
    }))
    .sort((a, b) => {
      if (b.hasEmail !== a.hasEmail) return b.hasEmail ? 1 : -1;
      return b.score - a.score;
    })
    .slice(0, maxAiScore)
    .map((x) => x.i)
    .sort((a, b) => a - b);

  if (topIndices.length === 0) return results;

  const aiLeads = topIndices.map((i) => leads[i]);
  try {
    const aiResults = await scoreLeadsChunk(aiLeads, 0, context);
    topIndices.forEach((originalIndex, j) => {
      results[originalIndex] = aiResults[j];
    });
    console.log(`[ai] Refined ${topIndices.length} leads with AI scoring`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDailyLimitError(error)) {
      console.warn("[ai] Daily token limit reached — using heuristic scores only");
    } else {
      console.warn(`[ai] AI scoring failed — using heuristic scores: ${message}`);
    }
  }

  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
