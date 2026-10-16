import { prisma } from "@/lib/db/prisma";
import {
  CHECKOUT_PLAN_KEYS,
  PLAN_LIMITS,
  planLimitKeyFromSlug,
  type CheckoutPlanKey,
} from "./planLimits";
import type { AvailablePlan, FullBillingStatus, UsageSnapshot } from "./billingTypes";
import { isBillingEnforced } from "./constants";
import {
  FREE_TRIAL_PLAN_SLUG,
  getSubscriptionForUser,
  isActiveSubscription,
  isOnFreeTrial,
  type SubscriptionWithPlan,
} from "./subscription";
import { buildUsageSnapshot } from "@/lib/services/billing/usageLimits";

export async function getFullBillingStatus(userId: string): Promise<FullBillingStatus> {
  const subscription = await getSubscriptionForUser(userId);
  const usage = await buildUsageSnapshot(userId, subscription);

  // A free-trial user is in good standing; any leftover unpaid checkout row is ignored.
  if (isOnFreeTrial(subscription)) {
    return {
      planName: "freeTrial",
      planSlug: FREE_TRIAL_PLAN_SLUG,
      displayPlanName: PLAN_LIMITS.freeTrial.name,
      subscriptionStatus: null,
      isActive: true,
      hasActiveSubscription: false,
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
      usage,
      availablePlans: CHECKOUT_PLAN_KEYS.map((key) => ({
        key,
        name: PLAN_LIMITS[key].name,
        monthlyLeads: PLAN_LIMITS[key].monthlyLeads,
        monthlySearches: PLAN_LIMITS[key].monthlySearches,
        features: [...PLAN_LIMITS[key].features],
        isCurrent: false,
      })),
    };
  }

  const isActive = isActiveSubscription(subscription);
  const planSlug = subscription?.plan.slug ?? null;
  const limitKey = planLimitKeyFromSlug(planSlug);

  const availablePlans: AvailablePlan[] = CHECKOUT_PLAN_KEYS.map((key) => ({
    key,
    name: PLAN_LIMITS[key].name,
    monthlyLeads: PLAN_LIMITS[key].monthlyLeads,
    monthlySearches: PLAN_LIMITS[key].monthlySearches,
    features: [...PLAN_LIMITS[key].features],
    isCurrent: planSlug === key && isActive,
  }));

  const displayPlanName =
    subscription?.planName ?? subscription?.plan.name ?? (limitKey ? PLAN_LIMITS[limitKey].name : null);

  return {
    planName: (limitKey === "freeTrial" ? "freeTrial" : (planSlug as CheckoutPlanKey | null)) ?? null,
    planSlug,
    displayPlanName,
    subscriptionStatus: subscription?.status ?? null,
    isActive,
    hasActiveSubscription: isBillingEnforced() ? isActive : true,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    currentPeriodStart: subscription?.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    stripeCustomerId: subscription?.stripeCustomerId ?? null,
    usage,
    availablePlans,
  };
}

/** Legacy shape for /api/billing/usage */
export async function getLegacyUsageSummary(
  userId: string,
  knownSubscription?: SubscriptionWithPlan | null
) {
  const subscription =
    knownSubscription !== undefined ? knownSubscription : await getSubscriptionForUser(userId);
  const usage = await buildUsageSnapshot(userId, subscription);
  return {
    plan: isOnFreeTrial(subscription)
      ? PLAN_LIMITS.freeTrial.name
      : (subscription?.plan.name ?? "No active plan"),
    leadsUsed: usage.leadsUsed,
    leadsLimit: usage.leadsLimit,
    searchesUsed: usage.searchesUsed,
    searchesLimit: usage.searchesLimit,
    leadsRemaining: usage.leadsRemaining,
    searchesRemaining: usage.searchesRemaining,
    usageExceededPlan: usage.usageExceededPlan,
  };
}
