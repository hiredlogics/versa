import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import {
  OnboardingRequiredError,
  requireOnboardingComplete,
} from "@/lib/context/userLeadContext";
import { findLeadsInputSchema } from "@/lib/validations/search-criteria";
import {
  startFindLeadsWorkflow,
  runFindLeadsJob,
  previewFindClarification,
  type FindLeadsInput,
} from "@/lib/services/leads/findLeadsWorkflow";
import { SubscriptionRequiredError, ensureAppAccess } from "@/lib/billing/subscription";
import {
  LeadSearchAccessError,
  UsageLimitError,
} from "@/lib/services/billing/usageLimits";
import { extractRequestedLeadCount } from "@/lib/clarifyPrompt";
import { getProcessBatchSize } from "@/lib/services/leads/fetchProgress";
import { toUserFacingSearchError } from "@/lib/services/leads/searchError";
import { prisma } from "@/lib/db/prisma";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await ensureAppAccess(user.id);
    await requireOnboardingComplete(user.id);

    const body = await request.json();
    const parsed = findLeadsInputSchema.parse(body);

    const input: FindLeadsInput = {
      prompt: parsed.prompt || "",
      inputType: parsed.inputType,
      jobDescription: parsed.jobDescription,
      jobRequirements: parsed.jobRequirements,
      minScore: parsed.minScore,
      requestedLeadCount: parsed.requestedLeadCount,
      skipClarification: parsed.skipClarification,
    };

    if (!input.requestedLeadCount && input.prompt) {
      input.requestedLeadCount = extractRequestedLeadCount(input.prompt);
    }

    if (!input.skipClarification) {
      const preview = await previewFindClarification(user, input);
      if (preview.clarification.needsClarification) {
        return NextResponse.json({
          status: "NEEDS_CLARIFICATION",
          async: false,
          leads: [],
          criteria: preview.clientCriteria,
          jobRequirements: preview.jobRequirements,
          message: preview.clarification.message,
          questions: preview.clarification.questions,
          requestedLeadCount: preview.clarification.requestedLeadCount,
          leadsRemaining: preview.leadsRemaining,
          batchSize: getProcessBatchSize(),
        });
      }
      if (preview.clarification.requestedLeadCount && !input.requestedLeadCount) {
        input.requestedLeadCount = preview.clarification.requestedLeadCount;
      }
    }

    const started = await startFindLeadsWorkflow(user, input);

    after(async () => {
      try {
        await runFindLeadsJob(user, input, started.searchId, {
          prompt: started.prompt,
          parseProvider: started.parseProvider,
          criteria: started.rawCriteria,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Search failed";
        console.error("[leads/find] background job failed:", msg);
        await prisma.leadSearch.update({
          where: { id: started.searchId },
          data: { status: "FAILED", errorMessage: toUserFacingSearchError(msg) },
        });
      }
    });

    return NextResponse.json({
      searchId: started.searchId,
      status: "RUNNING",
      async: true,
      criteria: started.clientCriteria,
      jobRequirements: started.jobRequirements,
      leads: [],
      message: started.message,
      leadsRemaining: started.leadsRemaining,
      batchSize: started.batchSize,
    });
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
