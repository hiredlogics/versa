import type Stripe from "stripe";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { STRIPE_STATUS_MAP } from "./constants";
import { ensureDefaultPlanSubscription, syncUserStripeCustomer } from "./subscription";

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const withLegacy = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription;
    parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } | null };
  };

  if (typeof withLegacy.subscription === "string") return withLegacy.subscription;
  if (withLegacy.subscription && typeof withLegacy.subscription === "object") {
    return withLegacy.subscription.id;
  }

  const nested = withLegacy.parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") return nested.id;

  return null;
}

function mapStatus(status: string): SubscriptionStatus {
  return STRIPE_STATUS_MAP[status] ?? "INCOMPLETE";
}

async function resolvePlanFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  return prisma.plan.findFirst({ where: { stripePriceId: priceId } });
}

async function resolveUserId(params: {
  metadataUserId?: string | null;
  clerkUserId?: string | null;
  stripeCustomerId?: string | null;
}) {
  if (params.metadataUserId) {
    const user = await prisma.user.findUnique({ where: { id: params.metadataUserId } });
    if (user) return user;
  }

  if (params.clerkUserId) {
    const user = await prisma.user.findUnique({ where: { clerkId: params.clerkUserId } });
    if (user) return user;
  }

  if (params.stripeCustomerId) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { stripeCustomerId: params.stripeCustomerId },
          { subscription: { stripeCustomerId: params.stripeCustomerId } },
        ],
      },
    });
    if (user) return user;
  }

  return null;
}

async function upsertSubscriptionFromStripe(
  stripeSub: Stripe.Subscription,
  hints: { userId?: string | null; clerkUserId?: string | null; planSlug?: string | null }
) {
  const priceId = stripeSub.items.data[0]?.price?.id ?? null;
  const planFromPrice = await resolvePlanFromPriceId(priceId);
  const planFromSlug = hints.planSlug
    ? await prisma.plan.findUnique({ where: { slug: hints.planSlug } })
    : null;
  const plan = planFromPrice ?? planFromSlug;

  const user = await resolveUserId({
    metadataUserId: hints.userId ?? stripeSub.metadata?.userId,
    clerkUserId: hints.clerkUserId ?? stripeSub.metadata?.clerkUserId,
    stripeCustomerId: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id,
  });

  if (!user) {
    console.error("[stripe-webhook] Could not resolve user for subscription", stripeSub.id);
    return;
  }

  const stripeCustomerId =
    typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? null;

  if (stripeCustomerId) {
    await syncUserStripeCustomer(user.id, stripeCustomerId);
  }

  const basePlan = plan ?? (await prisma.plan.findUnique({ where: { slug: "starter" } }));
  if (!basePlan) throw new Error("No plan configured for subscription sync.");

  await ensureDefaultPlanSubscription(user.id);

  const periodItem = stripeSub.items.data[0];
  const currentPeriodStart = periodItem?.current_period_start ?? null;
  const currentPeriodEnd = periodItem?.current_period_end ?? null;

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      planId: basePlan.id,
      stripeCustomerId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      planName: basePlan.name,
      status: mapStatus(stripeSub.status),
      currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
    update: {
      planId: basePlan.id,
      stripeCustomerId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      planName: basePlan.name,
      status: mapStatus(stripeSub.status),
      currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
  });
}

export async function processStripeEvent(event: Stripe.Event) {
  const existing = await prisma.stripeEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing?.processed) return;

  await prisma.stripeEvent.upsert({
    where: { stripeEventId: event.id },
    create: { stripeEventId: event.id, type: event.type, processed: false },
    update: {},
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeSubId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (stripeSubId) {
        const stripeSub = await import("./stripe").then(({ getStripe }) =>
          getStripe().subscriptions.retrieve(stripeSubId)
        );
        await upsertSubscriptionFromStripe(stripeSub, {
          userId: session.metadata?.userId,
          clerkUserId: session.metadata?.clerkUserId,
          planSlug: session.metadata?.plan,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripe(stripeSub, {
        userId: stripeSub.metadata?.userId,
        clerkUserId: stripeSub.metadata?.clerkUserId,
        planSlug: stripeSub.metadata?.plan,
      });
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = getInvoiceSubscriptionId(invoice);
      if (stripeSubId) {
        const stripeSub = await import("./stripe").then(({ getStripe }) =>
          getStripe().subscriptions.retrieve(stripeSubId)
        );
        await upsertSubscriptionFromStripe(stripeSub, {
          userId: stripeSub.metadata?.userId,
          clerkUserId: stripeSub.metadata?.clerkUserId,
          planSlug: stripeSub.metadata?.plan,
        });
      }
      break;
    }
    default:
      break;
  }

  await prisma.stripeEvent.update({
    where: { stripeEventId: event.id },
    data: { processed: true },
  });
}
