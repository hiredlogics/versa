import type { User } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import type { CheckoutPlanSlug } from "./constants";
import { getAppUrl } from "./constants";
import { getStripe } from "./stripe";
import { ensureDefaultPlanSubscription, syncUserStripeCustomer } from "./subscription";

export async function createCheckoutSession(params: {
  user: User;
  planSlug: CheckoutPlanSlug;
}) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthorized");

  const plan = await prisma.plan.findUnique({ where: { slug: params.planSlug } });
  if (!plan?.stripePriceId) {
    throw new Error("Selected plan is not available for checkout.");
  }

  const subscription = await ensureDefaultPlanSubscription(params.user.id);
  const stripeCustomerId = params.user.stripeCustomerId ?? subscription.stripeCustomerId ?? undefined;
  const appUrl = getAppUrl();

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    customer_email: stripeCustomerId ? undefined : params.user.email,
    client_reference_id: clerkUserId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing/cancel`,
    metadata: {
      clerkUserId,
      userId: params.user.id,
      plan: params.planSlug,
    },
    subscription_data: {
      metadata: {
        clerkUserId,
        userId: params.user.id,
        plan: params.planSlug,
      },
    },
  });

  if (session.customer && typeof session.customer === "string" && !params.user.stripeCustomerId) {
    await syncUserStripeCustomer(params.user.id, session.customer);
    await prisma.subscription.update({
      where: { userId: params.user.id },
      data: { stripeCustomerId: session.customer },
    });
  }

  if (!session.url) throw new Error("Stripe checkout session URL missing.");
  return session;
}
