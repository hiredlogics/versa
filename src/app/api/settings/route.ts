import { NextResponse } from "next/server";

/**
 * API keys (Apollo, AI) are configured server-side via environment variables.
 * End users must not manage provider credentials in the app UI.
 */
export async function GET() {
  return NextResponse.json(
    { error: "API key management is not available in the app." },
    { status: 404 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "API key management is not available in the app." },
    { status: 404 }
  );
}
