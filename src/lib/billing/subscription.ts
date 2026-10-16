import type { Plan, Subscription, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isOnboardingComplete } from "@/lib/context/userLeadContext";
import { ACTIVE_SUBSCRIPTION_STATUSES, STRIPE_STATUS_MAP, isBillingEnforced } from "./constants";

export const FREE_TRIAL_PLAN_SLUG = "free-trial";

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

/**
 * With billing enforced, every signed-in user without an active paid plan is on
 * the free trial. That includes users whose checkout never completed (an
 * INCOMPLETE starter row) and users whose paid plan lapsed.
 */
export function isOnFreeTrial(
  subscription: Pick<Subscription, "status" | "stripeSubscriptionId"> | null | undefined
): boolean {
  return isBillingEnforced() && !isActiveSubscription(subscription);
}

/** The subscription whose plan and billing period apply, or null when the free trial applies. */
export function paidSubscriptionOrNull<T extends Pick<Subscription, "status" | "stripeSubscriptionId">>(
  subscription: T | null | undefined
): T | null {
  return subscription && isActiveSubscription(subscription) ? subscription : null;
}

export async function getFreeTrialPlan(): Promise<Plan> {
  const plan = await prisma.plan.findUnique({ where: { slug: FREE_TRIAL_PLAN_SLUG } });
  if (!plan) throw new Error("Free trial plan not found. Run prisma db seed.");
  return plan;
}

/** The plan whose limits apply right now: the paid plan, the free trial, or (billing off) the stored plan. */
export async function getEffectivePlan(
  subscription: SubscriptionWithPlan | null
): Promise<Plan | null> {
  if (isOnFreeTrial(subscription)) return getFreeTrialPlan();
  return subscription?.plan ?? null;
}

export async function getBillingStatus(userId: string) {
  const subscription = await getSubscriptionForUser(userId);
  const active = isActiveSubscription(subscription);

  return {
    hasActiveSubscription: isBillingEnforced() ? active : true,
    onFreeTrial: isOnFreeTrial(subscription),
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

/**
 * Gate for anything a free-trial user may do (onboarding, starting a search).
 * Plan limits are enforced separately by requireLeadSearchAccess.
 */
export async function ensureAppAccess(userId: string): Promise<void> {
  if (!isBillingEnforced()) {
    await requireActiveSubscription(userId);
  }
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
  // No paid-plan check: users without one start on the free trial.
  const complete = await isOnboardingComplete(user.id);
  if (!complete) return "/onboarding";
  return "/app";
}
