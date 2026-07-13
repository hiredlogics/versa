import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { isBillingEnforced } from "@/lib/billing/constants";
import { getLegacyUsageSummary } from "@/lib/billing/billingDashboard";

export async function GET() {
  try {
    const user = await requireUser();
    const usage = await getLegacyUsageSummary(user.id);
    return NextResponse.json({
      ...usage,
      billingEnforced: isBillingEnforced(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
