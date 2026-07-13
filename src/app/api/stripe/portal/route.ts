import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { createBillingPortalSession } from "@/lib/billing/createBillingPortalSession";
import { getSubscriptionForUser } from "@/lib/billing/subscription";

export async function POST() {
  try {
    const user = await requireUser();
    const subscription = await getSubscriptionForUser(user.id);
    const customerId = user.stripeCustomerId ?? subscription?.stripeCustomerId ?? null;

    if (!customerId) {
      return NextResponse.json(
        { error: "No billing account found. Subscribe to a plan first." },
        { status: 400 }
      );
    }

    const session = await createBillingPortalSession(customerId);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Portal failed";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
