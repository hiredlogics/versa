import { NextResponse } from "next/server";
import { releaseStale } from "@/lib/pipeline/credits";

/**
 * A serverless function killed mid-batch leaves its hold HELD, locking credits
 * the user never spent. This is the backstop that frees them.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Refuse rather than run unauthenticated: an open endpoint that settles
    // credit holds is worth more to an attacker than to us.
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await releaseStale(30);
  return NextResponse.json({ released });
}
