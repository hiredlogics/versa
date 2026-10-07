import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { InsufficientCreditsError, balance } from "./credits";
import { toCreditsDTO } from "./dto";
import { providerDeps } from "@/lib/providers/people-data";
import { runBatch } from "./run";
import type { Brief } from "./types";

/** Shared route plumbing so the four endpoints stay assembly, not logic. */

/**
 * Response envelopes are built here rather than inline in each route, so the
 * shape a browser receives has one definition and one test. Adding a field,  * a debug flag, a stray spread, has to happen inside a tested function.
 */

export function clarificationEnvelope(input: {
  searchId: string;
  understood: unknown;
  questions: unknown;
  exhausted?: boolean;
}) {
  return {
    status: "needs_clarification" as const,
    searchId: input.searchId,
    understood: input.understood,
    questions: input.questions,
    exhausted: Boolean(input.exhausted),
  };
}

export function runningEnvelope(input: {
  searchId: string;
  brief: unknown;
  credits: unknown;
}) {
  return {
    status: "running" as const,
    searchId: input.searchId,
    brief: input.brief,
    credits: input.credits,
  };
}

export function searchStateEnvelope(input: {
  search: unknown;
  understood: unknown;
  questions: unknown;
  leads: unknown[];
  credits: unknown;
}) {
  return {
    search: input.search,
    understood: input.understood,
    questions: input.questions,
    leads: input.leads,
    credits: input.credits,
  };
}

export function batchStartedEnvelope(input: { searchId: string; credits: unknown }) {
  return {
    status: "running" as const,
    searchId: input.searchId,
    credits: input.credits,
  };
}

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function creditsPayload(userId: string) {
  return toCreditsDTO(await balance(userId));
}

/** Maps the errors every route can raise onto the agreed status codes. */
export async function toErrorResponse(error: unknown, userId?: string) {
  if (error instanceof InsufficientCreditsError) {
    return fail(402, error.message, userId ? { credits: await creditsPayload(userId) } : undefined);
  }

  const message = error instanceof Error ? error.message : "Request failed";
  if (message === "Unauthorized") return fail(401, message);
  if (/no ai providers|ai timeout|all ai providers failed/i.test(message)) {
    return fail(502, "The assistant is unreachable right now. Nothing was charged.");
  }

  console.error("[pipeline/api]", message);
  return fail(500, "Something went wrong. Nothing was charged.");
}

export function readBrief(value: unknown): Brief | null {
  if (!value || typeof value !== "object") return null;
  const brief = value as Brief;
  if (!brief.titles?.length || !brief.location || !brief.requestedTotal) return null;
  return brief;
}

/**
 * Runs one batch in the background. The client polls GET for progress; nothing
 * here loops, so a batch can only ever be started by an explicit request.
 */
export async function startBatch(userId: string, searchId: string, brief: Brief) {
  await prisma.leadSearch.update({
    where: { id: searchId },
    data: { status: "RUNNING", statusNote: "Finding and verifying people…", errorMessage: null },
  });

  try {
    await runBatch({ userId, searchId, brief }, providerDeps());
  } catch (error) {
    // runBatch has already released its hold and marked the search FAILED; this
    // is only so a background rejection cannot go unlogged.
    console.error("[pipeline/api] batch failed:", error instanceof Error ? error.message : error);
  }
}
