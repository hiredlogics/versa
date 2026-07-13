import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { getApiKeysStatus, maskKey, readEnvKeys, saveApiKeys } from "@/lib/env";

export async function GET() {
  try {
    await requireAdminSession();
    const status = getApiKeysStatus();
    const keys = readEnvKeys();

    return NextResponse.json({
      status,
      masked: {
        apollo: maskKey(keys.APOLLO_API_KEY),
        groq: maskKey(keys.GROQ_API_KEY),
        openai: maskKey(keys.OPENAI_API_KEY),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
    const body = await request.json();
    const { apolloKey, groqKey, openaiKey } = body as {
      apolloKey?: string;
      groqKey?: string;
      openaiKey?: string;
    };

    if (!apolloKey && !groqKey && !openaiKey) {
      return NextResponse.json({ error: "At least one API key is required" }, { status: 400 });
    }

    const existing = readEnvKeys();
    saveApiKeys({
      APOLLO_API_KEY: apolloKey || existing.APOLLO_API_KEY || "",
      GROQ_API_KEY: groqKey || existing.GROQ_API_KEY || "",
      OPENAI_API_KEY: openaiKey || existing.OPENAI_API_KEY || "",
    });

    return NextResponse.json({
      success: true,
      message: "API keys saved to .env.local",
      status: getApiKeysStatus(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save keys";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
