import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import {
  OnboardingRequiredError,
  requireOnboardingComplete,
} from "@/lib/context/userLeadContext";
import { findLeadsInputSchema } from "@/lib/validations/search-criteria";
import { findLeadsWorkflow, type FindLeadsInput } from "@/lib/services/leads/findLeadsWorkflow";
import { SubscriptionRequiredError, requireActiveSubscription } from "@/lib/billing/subscription";
import {
  LeadSearchAccessError,
  UsageLimitError,
} from "@/lib/services/billing/usageLimits";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireActiveSubscription(user.id);
    await requireOnboardingComplete(user.id);

    const body = await request.json();
    const parsed = findLeadsInputSchema.parse(body);

    const input: FindLeadsInput = {
      prompt: parsed.prompt || "",
      inputType: parsed.inputType,
      minScore: parsed.minScore,
    };

    if (parsed.linkedinUrl) {
      input.linkedinUrl = parsed.linkedinUrl;
      input.inputType = "linkedin";
    }
    if (parsed.companyUrl) {
      input.companyUrl = parsed.companyUrl;
      input.inputType = "company_url";
    }
    if (parsed.companyName) {
      input.companyName = parsed.companyName;
      input.inputType = "company_name";
    }

    const result = await findLeadsWorkflow(user, input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { error: "Active subscription required.", code: "NO_ACTIVE_SUBSCRIPTION" },
        { status: 402 }
      );
    }
    if (error instanceof LeadSearchAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code, billing: error.billing },
        { status: error.status }
      );
    }
    if (error instanceof OnboardingRequiredError) {
      return NextResponse.json(
        { error: error.message, redirect: "/onboarding" },
        { status: 403 }
      );
    }
    if (error instanceof UsageLimitError) {
      return NextResponse.json(
        { error: error.message, code: "LEAD_LIMIT_REACHED" },
        { status: 402 }
      );
    }
    const msg = error instanceof Error ? error.message : "Search failed";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (/apollo/i.test(msg)) {
      console.error("[leads/find] provider error:", msg);
      return NextResponse.json(
        {
          error: "Lead search is temporarily unavailable. Please try again in a few minutes.",
          code: "SEARCH_PROVIDER_ERROR",
        },
        { status: 502 }
      );
    }
    console.error("[leads/find]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
