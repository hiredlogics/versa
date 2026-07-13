import { NextRequest, NextResponse } from "next/server";
import { runLeadSearch } from "@/lib/lead-search";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, minScore = 8 } = body as { prompt: string; minScore?: number };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    console.log("[leads/search] Starting search...");
    const result = await runLeadSearch(prompt.trim(), minScore);
    console.log(`[leads/search] Done — ${result.session.leads.length} leads`);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Lead search error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
