import type { AiProvider } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function logAiProviderCall(params: {
  userId?: string;
  searchId?: string;
  provider: AiProvider;
  operation: string;
  success: boolean;
  latencyMs?: number;
  errorMessage?: string;
}) {
  try {
    await prisma.aiProviderLog.create({ data: params });
  } catch (e) {
    console.error("[ai-log]", e);
  }
}

export async function logApolloCall(params: {
  userId?: string;
  searchId?: string;
  endpoint: string;
  statusCode?: number;
  resultCount?: number;
  relaxLevel?: number;
  latencyMs?: number;
  errorMessage?: string;
}) {
  try {
    await prisma.apolloApiLog.create({ data: params });
  } catch (e) {
    console.error("[apollo-log]", e);
  }
}
