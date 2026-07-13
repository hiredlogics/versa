import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { parsePromptWithAi } from "@/lib/services/ai/parsePrompt";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { prompt } = await request.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    const result = await parsePromptWithAi(prompt.trim(), { userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
