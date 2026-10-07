import OpenAI from "openai";
import type { ChatConversation, ChatIntentResult, ScoredLead } from "./types";

function getAIClient(): { client: OpenAI; model: string } {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const key = groqKey || openaiKey;

  if (!key) {
    throw new Error("No AI API key configured.");
  }

  if (key.startsWith("gsk_") || groqKey) {
    return {
      client: new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" }),
      model: "llama-3.3-70b-versatile",
    };
  }

  return { client: new OpenAI({ apiKey: key }), model: "gpt-4o-mini" };
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
      const msg = error instanceof Error ? error.message : String(error);
      if ((msg.includes("429") || msg.toLowerCase().includes("rate limit")) && attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("AI request failed");
}

export async function generateConversationTitle(firstMessage: string): Promise<string> {
  const { client, model } = getAIClient();

  const response = await chatWithRetry(client, {
    model,
    messages: [
      {
        role: "system",
        content:
          "Generate a short 4-6 word title for a lead search chat based on the user's first message. Return ONLY the title, no quotes.",
      },
      { role: "user", content: firstMessage },
    ],
    temperature: 0.3,
    max_tokens: 20,
  });

  const title = response.choices[0]?.message?.content?.trim();
  if (title && title.length < 60) return title;
  return firstMessage.slice(0, 45) + (firstMessage.length > 45 ? "..." : "");
}

export async function classifyChatIntent(
  message: string,
  conversation: ChatConversation | null,
  hasSimilarExisting: boolean
): Promise<ChatIntentResult> {
  const { client, model } = getAIClient();

  const historySummary = conversation?.messages
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const leadsContext =
    conversation && conversation.leads.length > 0
      ? `This conversation has ${conversation.leads.length} leads already found. Top leads: ${conversation.leads
          .slice(0, 3)
          .map((l) => `${l.name} (${l.title} at ${l.company})`)
          .join(", ")}`
      : "No leads found in this conversation yet.";

  const response = await chatWithRetry(client, {
    model,
    messages: [
      {
        role: "system",
        content: `You classify user messages in a B2B lead finder chat app.

Intents:
- "lead_search": User wants to FIND/SEARCH new leads (e.g. "find SaaS CEOs", "search for founders in UK")
- "follow_up": User wants help WITH EXISTING leads (e.g. "write outreach email", "draft LinkedIn message", "help me reach out", "make a resume", "what should I say", "how do I contact them")
- "general": General question not about searching or following up

${hasSimilarExisting ? "NOTE: A very similar search may already exist in history." : ""}

Return JSON only:
{
  "intent": "lead_search" | "follow_up" | "general",
  "isDuplicate": boolean,
  "reasoning": "brief explanation"
}

isDuplicate=true ONLY if intent is lead_search AND the request is essentially the same as a previous search in this conversation.`,
      },
      {
        role: "user",
        content: `Conversation context:\n${leadsContext}\n\nRecent history:\n${historySummary || "None"}\n\nNew message: "${message}"`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { intent: "lead_search", isDuplicate: false, reasoning: "Default" };
  }

  const parsed = JSON.parse(content) as ChatIntentResult;
  return {
    intent: parsed.intent || "lead_search",
    isDuplicate: parsed.isDuplicate || false,
    reasoning: parsed.reasoning || "",
  };
}

export async function generateFollowUpResponse(
  message: string,
  conversation: ChatConversation
): Promise<string> {
  const { client, model } = getAIClient();

  const leadsSummary = conversation.leads
    .slice(0, 10)
    .map(
      (l, i) =>
        `${i + 1}. ${l.name}, ${l.title} at ${l.company} (${l.industry}, ${l.employees} employees, score ${l.score}/10)${l.email ? `, email: ${l.email}` : ""}${l.linkedinUrl ? `, LinkedIn: ${l.linkedinUrl}` : ""}\n   Why qualified: ${l.reasoning}`
    )
    .join("\n\n");

  const history = conversation.messages
    .slice(-8)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await chatWithRetry(client, {
    model,
    messages: [
      {
        role: "system",
        content: `You are an expert B2B sales assistant helping the user work with their qualified leads.

You can help with:
- Drafting cold outreach emails (use lead email when available)
- Writing LinkedIn connection messages
- Tailoring resume/CV for reaching out to specific companies or roles
- Creating follow-up sequences for job seekers or B2B outreach
- Prioritizing which leads to contact first (prefer those with email)

Use the lead data provided. Be specific, actionable, and professional.
If the user asks to reach out to a specific person, personalize for that lead.
Format emails/messages clearly with subject lines when relevant.`,
      },
      ...history,
      {
        role: "user",
        content: `Available leads in this conversation:\n\n${leadsSummary || "No leads yet, tell the user to run a search first."}\n\nUser request: ${message}`,
      },
    ],
    temperature: 0.7,
  });

  return (
    response.choices[0]?.message?.content ||
    "I couldn't generate a response. Please try rephrasing your question."
  );
}

export async function generateGeneralResponse(
  message: string,
  conversation: ChatConversation | null
): Promise<string> {
  const { client, model } = getAIClient();

  const response = await chatWithRetry(client, {
    model,
    messages: [
      {
        role: "system",
        content: `You are a helpful B2B lead generation assistant. Help users find leads, understand their results, and plan outreach. If they want to find leads, suggest they describe who they're looking for. If they have leads, offer to help with outreach.`,
      },
      ...(conversation?.messages.slice(-4).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })) || []),
      { role: "user", content: message },
    ],
    temperature: 0.5,
  });

  return response.choices[0]?.message?.content || "How can I help you find leads today?";
}

export function formatLeadsForContext(leads: ScoredLead[]): string {
  return leads.map((l) => `${l.name} (${l.title} @ ${l.company})`).join(", ");
}
