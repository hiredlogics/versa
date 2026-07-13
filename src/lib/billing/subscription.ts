import type { Subscription, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isOnboardingComplete } from "@/lib/context/userLeadContext";
import { ACTIVE_SUBSCRIPTION_STATUSES, STRIPE_STATUS_MAP, isBillingEnforced } from "./constants";

export class SubscriptionRequiredError extends Error {
  constructor(message = "Active subscription required.") {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

export function mapStripeStatus(status: string): SubscriptionStatusFromStripe {
  return STRIPE_STATUS_MAP[status] ?? "INCOMPLETE";
}

type SubscriptionStatusFromStripe = (typeof STRIPE_STATUS_MAP)[keyof typeof STRIPE_STATUS_MAP];

export function isActiveSubscription(
  subscription: Pick<Subscription, "status" | "stripeSubscriptionId"> | null | undefined
): boolean {
  if (!isBillingEnforced()) return true;
  if (!subscription?.stripeSubscriptionId) return false;
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status);
}

export async function getSubscriptionForUser(userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
}

export async function getBillingStatus(userId: string) {
  const subscription = await getSubscriptionForUser(userId);
  const active = isActiveSubscription(subscription);

  return {
    hasActiveSubscription: isBillingEnforced() ? active : true,
    status: subscription?.status ?? null,
    planName: subscription?.planName ?? subscription?.plan.name ?? null,
    planSlug: subscription?.plan.slug ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    stripeCustomerId: subscription?.stripeCustomerId ?? null,
  };
}

export async function requireActiveSubscription(userId: string): Promise<Subscription> {
  if (!isBillingEnforced()) {
    const existing = await getSubscriptionForUser(userId);
    if (existing) return existing;
    return ensureDefaultPlanSubscription(userId);
  }

  const subscription = await getSubscriptionForUser(userId);
  if (!isActiveSubscription(subscription)) {
    throw new SubscriptionRequiredError();
  }
  return subscription!;
}

export async function ensureDefaultPlanSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  const starterPlan = await prisma.plan.findUnique({ where: { slug: "starter" } });
  if (!starterPlan) throw new Error("Starter plan not found. Run prisma db seed.");

  return prisma.subscription.create({
    data: {
      userId,
      planId: starterPlan.id,
      status: "INCOMPLETE",
      planName: starterPlan.name,
    },
  });
}

export async function syncUserStripeCustomer(userId: string, stripeCustomerId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId },
  });
}

export type SubscriptionWithPlan = NonNullable<Awaited<ReturnType<typeof getSubscriptionForUser>>>;

export function subscriptionSnapshot(sub: SubscriptionWithPlan) {
  return {
    isAuthenticated: true as const,
    hasActiveSubscription: isActiveSubscription(sub),
    status: sub.status,
    planName: sub.planName ?? sub.plan.name,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function getPostAuthRedirectPath(user: User): Promise<string> {
  if (isBillingEnforced()) {
    const status = await getBillingStatus(user.id);
    if (!status.hasActiveSubscription) return "/pricing";
  }
  const complete = await isOnboardingComplete(user.id);
  if (!complete) return "/onboarding";
  return "/app";
}
