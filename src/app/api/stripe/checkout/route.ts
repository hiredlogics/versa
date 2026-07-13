import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { createCheckoutSession } from "@/lib/billing/createCheckoutSession";
import { checkoutPlanSchema } from "@/lib/billing/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = checkoutPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid plan selected." }, { status: 400 });
    }

    const session = await createCheckoutSession({
      user,
      planSlug: parsed.data.plan,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Checkout failed";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
