import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { requireActiveSubscription } from "@/lib/billing/subscription";
import {
  getUserLeadContext,
  patchUserLeadContext,
  upsertUserLeadContext,
} from "@/lib/context/userLeadContext";
import { onboardingContextFieldsSchema } from "@/lib/validations/onboarding-context";
import { ZodError } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    const context = await getUserLeadContext(user.id);
    return NextResponse.json({
      context,
      onboardingCompleted: context?.onboardingCompleted ?? false,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireActiveSubscription(user.id);

    const body = await request.json();
    const input = onboardingContextFieldsSchema.parse(body);
    const context = await upsertUserLeadContext(user.id, input, { markComplete: true });

    return NextResponse.json({
      context,
      onboardingCompleted: context.onboardingCompleted,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.errors.map((e) => e.message).join("; ") },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : "Failed";
    if (msg.includes("subscription")) {
      return NextResponse.json({ error: msg }, { status: 402 });
    }
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = onboardingContextFieldsSchema.parse(body);
    const context = await patchUserLeadContext(user.id, input);

    return NextResponse.json({
      context,
      onboardingCompleted: context.onboardingCompleted,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.errors.map((e) => e.message).join("; ") },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
