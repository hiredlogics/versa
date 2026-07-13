import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripe } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/webhook";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = (await headers()).get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!sig || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  try {
    await processStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] Processing failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
