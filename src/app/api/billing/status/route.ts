import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { getFullBillingStatus } from "@/lib/billing/billingDashboard";

export async function GET() {
  try {
    const user = await requireUser();
    const billing = await getFullBillingStatus(user.id);

    return NextResponse.json({
      isAuthenticated: true,
      hasActiveSubscription: billing.hasActiveSubscription,
      isActive: billing.isActive,
      status: billing.subscriptionStatus,
      subscriptionStatus: billing.subscriptionStatus,
      planName: billing.displayPlanName,
      planSlug: billing.planSlug,
      displayPlanName: billing.displayPlanName,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
      currentPeriodStart: billing.currentPeriodStart,
      currentPeriodEnd: billing.currentPeriodEnd,
      stripeCustomerId: billing.stripeCustomerId,
      usage: billing.usage,
      availablePlans: billing.availablePlans,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
