import type { AiProvider } from "@prisma/client";
import OpenAI from "openai";
import { resolveEnvKey } from "@/lib/env";
import { logAiProviderCall } from "@/lib/services/admin/apiHealth";

export type AiTask = "parse" | "score" | "outreach";

export interface AiCallOptions {
  userId?: string;
  searchId?: string;
  operation: AiTask;
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
  /**
   * OpenAI model to use instead of the default (e.g. "gpt-4o" for the small,
   * high-stakes post-unlock check). Ignored for the other providers.
   */
  openAiModel?: string;
}

const TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || "30000", 10);

type ProviderConfig = {
  name: AiProvider;
  client: OpenAI;
  model: string;
};

function getProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  if (resolveEnvKey("OPENAI_API_KEY")) {
    providers.push({
      name: "OPENAI",
      client: new OpenAI({ apiKey: resolveEnvKey("OPENAI_API_KEY") }),
      model: "gpt-4o-mini",
    });
  }
  if (resolveEnvKey("GROQ_API_KEY")) {
    providers.push({
      name: "GROQ",
      client: new OpenAI({
        apiKey: resolveEnvKey("GROQ_API_KEY"),
        baseURL: "https://api.groq.com/openai/v1",
      }),
      model: "llama-3.1-8b-instant",
    });
  }
  if (process.env.GEMINI_API_KEY?.trim()) {
    providers.push({
      name: "GEMINI",
      client: new OpenAI({
        apiKey: process.env.GEMINI_API_KEY.trim(),
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
      model: "gemini-2.0-flash",
    });
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    providers.push({
      name: "CLAUDE",
      client: new OpenAI({
        apiKey: process.env.ANTHROPIC_API_KEY.trim(),
        baseURL: "https://api.anthropic.com/v1/",
      }),
      model: "claude-3-5-haiku-latest",
    });
  }

  return providers;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function aiChat(options: AiCallOptions): Promise<{
  content: string;
  provider: AiProvider;
}> {
  const providers = getProviders();
  if (providers.length === 0) {
    throw new Error("No AI providers configured");
  }

  let lastError = "";

  for (const { name, client, model } of providers) {
    const start = Date.now();
    try {
      const response = await withTimeout(
        client.chat.completions.create({
          model: name === "OPENAI" && options.openAiModel ? options.openAiModel : model,
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.user },
          ],
          temperature: options.temperature ?? 0.2,
          ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        }),
        TIMEOUT_MS
      );

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty AI response");

      await logAiProviderCall({
        userId: options.userId,
        searchId: options.searchId,
        provider: name,
        operation: options.operation,
        success: true,
        latencyMs: Date.now() - start,
      });

      return { content, provider: name };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await logAiProviderCall({
        userId: options.userId,
        searchId: options.searchId,
        provider: name,
        operation: options.operation,
        success: false,
        latencyMs: Date.now() - start,
        errorMessage: lastError.slice(0, 500),
      });
      console.warn(`[aiRouter] ${name} failed: ${lastError}`);
    }
  }

  // Keep this prefix: callers (parsePrompt, clarifyWithAi) match on it to fall
  // back to heuristic parsing instead of failing the whole search.
  throw new Error(`All AI providers failed: ${lastError || "unknown error"}`);
}
