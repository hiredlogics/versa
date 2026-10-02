import { prisma } from "@/lib/db/prisma";
import type { Plan, Subscription, User } from "@prisma/client";
import { APOLLO_HARD_MAX_RECORDS } from "@/lib/apollo-config";
import { isBillingEnforced } from "@/lib/billing/constants";
import { FREE_TRIAL_PERIOD } from "@/lib/billing/planLimits";
import type { LeadSearchAccessCode } from "@/lib/billing/billingTypes";
import {
  ensureDefaultPlanSubscription,
  getEffectivePlan,
  getSubscriptionForUser,
  isOnFreeTrial,
  paidSubscriptionOrNull,
} from "@/lib/billing/subscription";
import type { SubscriptionWithPlan } from "@/lib/billing/subscription";

export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageLimitError";
  }
}

export class LeadSearchAccessError extends Error {
  code: LeadSearchAccessCode;
  status: number;
  billing?: Record<string, unknown>;

  constructor(
    message: string,
    code: LeadSearchAccessCode,
    status: number,
    billing?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LeadSearchAccessError";
    this.code = code;
    this.status = status;
    this.billing = billing;
  }
}

export function formatPeriodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getUsagePeriod(subscription: Pick<Subscription, "currentPeriodStart" | "currentPeriodEnd"> | null, date = new Date()) {
  if (subscription?.currentPeriodStart && subscription?.currentPeriodEnd) {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
      periodKey: formatPeriodKey(subscription.currentPeriodStart),
    };
  }

  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end, periodKey: formatPeriodKey(start) };
}

/** Paid plans count usage per billing period; the free trial is counted once and never resets. */
export function usagePeriodFor(
  subscription: Pick<
    Subscription,
    "status" | "stripeSubscriptionId" | "currentPeriodStart" | "currentPeriodEnd"
  > | null,
  date = new Date()
) {
  if (isOnFreeTrial(subscription)) {
    return {
      start: new Date(FREE_TRIAL_PERIOD.start),
      end: new Date(FREE_TRIAL_PERIOD.end),
      periodKey: FREE_TRIAL_PERIOD.periodKey,
    };
  }
  return getUsagePeriod(paidSubscriptionOrNull(subscription), date);
}

export async function getOrCreateUsageRecord(
  userId: string,
  periodStart: Date,
  periodEnd: Date
) {
  return prisma.usageRecord.upsert({
    where: { userId_periodStart: { userId, periodStart } },
    create: { userId, periodStart, periodEnd },
    update: {},
  });
}

export async function getUserPlanLimits(user: User): Promise<Plan> {
  const sub = await getSubscriptionForUser(user.id);

  const effective = await getEffectivePlan(sub);
  if (effective) return effective;

  if (!isBillingEnforced()) {
    await ensureDefaultPlanSubscription(user.id);
    const starter = await prisma.plan.findUnique({ where: { slug: "starter" } });
    if (starter) return starter;
  }

  throw new UsageLimitError("Active subscription required.");
}

function buildUsageSnapshotFromRecord(
  usage: { leadsUsed: number; searchesUsed: number },
  plan: Plan,
  period: { start: Date; end: Date; periodKey: string }
) {
  const leadsLimit = plan.leadsPerMonth;
  const searchesLimit = plan.searchesPerMonth;
  const leadsUsed = usage.leadsUsed;
  const searchesUsed = usage.searchesUsed;
  const unlimited = !isBillingEnforced();
  const leadsRemaining = unlimited ? leadsLimit : Math.max(0, leadsLimit - leadsUsed);
  const searchesRemaining = unlimited ? searchesLimit : Math.max(0, searchesLimit - searchesUsed);

  return {
    periodKey: period.periodKey,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    leadsUsed,
    leadsLimit,
    leadsRemaining,
    searchesUsed,
    searchesLimit,
    searchesRemaining,
    leadsPercent: leadsLimit > 0 ? Math.min(100, Math.round((leadsUsed / leadsLimit) * 100)) : 0,
    searchesPercent:
      searchesLimit > 0 ? Math.min(100, Math.round((searchesUsed / searchesLimit) * 100)) : 0,
    usageExceededPlan: unlimited ? false : leadsUsed > leadsLimit || searchesUsed > searchesLimit,
  };
}

export async function buildUsageSnapshot(userId: string, subscription: SubscriptionWithPlan | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  try {
    const plan = (await getEffectivePlan(subscription)) ?? (await getUserPlanLimits(user));
    const period = usagePeriodFor(subscription);
    const usage = await getOrCreateUsageRecord(userId, period.start, period.end);
    return buildUsageSnapshotFromRecord(usage, plan, period);
  } catch {
    const period = getUsagePeriod(null);
    return {
      periodKey: period.periodKey,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      leadsUsed: 0,
      leadsLimit: 0,
      leadsRemaining: 0,
      searchesUsed: 0,
      searchesLimit: 0,
      searchesRemaining: 0,
      leadsPercent: 0,
      searchesPercent: 0,
      usageExceededPlan: false,
    };
  }
}

export async function requireLeadSearchAccess(user: User, requestedMaxLeads?: number) {
  // Users without an active paid plan search on the free trial's limits.
  const subscription = await getSubscriptionForUser(user.id);
  const plan = await getUserPlanLimits(user);
  const period = usagePeriodFor(subscription);
  const usage = await getOrCreateUsageRecord(user.id, period.start, period.end);

  if (!isBillingEnforced()) {
    // Dev / billing-off: don't clamp Apollo bulk pulls to Starter's 500/mo plan quota
    const effectiveMaxLeads =
      requestedMaxLeads != null && requestedMaxLeads > 0
        ? requestedMaxLeads
        : APOLLO_HARD_MAX_RECORDS;
    return {
      allowed: true as const,
      effectiveMaxLeads,
      leadsRemaining: effectiveMaxLeads,
      searchesRemaining: plan.searchesPerMonth,
      period,
      plan,
      usage,
      subscription,
    };
  }

  const leadsLimit = plan.leadsPerMonth;
  const searchesLimit = plan.searchesPerMonth;
  const leadsRemaining = Math.max(0, leadsLimit - usage.leadsUsed);
  const searchesRemaining = Math.max(0, searchesLimit - usage.searchesUsed);

  const usageSnapshot = buildUsageSnapshotFromRecord(usage, plan, period);

  if (usage.searchesUsed >= searchesLimit) {
    throw new LeadSearchAccessError(
      `Search limit reached (${usage.searchesUsed}/${searchesLimit} this period). Upgrade your plan.`,
      "SEARCH_LIMIT_REACHED",
      429,
      { usage: usageSnapshot, displayPlanName: plan.name }
    );
  }

  if (leadsRemaining <= 0) {
    throw new LeadSearchAccessError(
      usageSnapshot.usageExceededPlan
        ? "Usage exceeded your plan limit due to previous tracking. Future searches are blocked until upgrade or next billing period."
        : `Lead credit limit reached (${usage.leadsUsed}/${leadsLimit} this period). Upgrade your plan.`,
      "LEAD_LIMIT_REACHED",
      402,
      { usage: usageSnapshot, displayPlanName: plan.name }
    );
  }

  const effectiveMaxLeads =
    requestedMaxLeads != null && requestedMaxLeads > 0
      ? Math.min(requestedMaxLeads, leadsRemaining)
      : leadsRemaining;

  return {
    allowed: true as const,
    effectiveMaxLeads,
    leadsRemaining,
    searchesRemaining,
    period,
    plan,
    usage,
    subscription,
  };
}

/** @deprecated Use requireLeadSearchAccess */
export async function checkSearchAllowed(user: User) {
  await requireLeadSearchAccess(user);
}

/** @deprecated Use requireLeadSearchAccess + cap before save */
export async function checkLeadsAllowed(user: User, count: number) {
  const access = await requireLeadSearchAccess(user, count);
  if (count > access.effectiveMaxLeads) {
    throw new UsageLimitError(
      `Lead limit would be exceeded. Only ${access.effectiveMaxLeads} credits remaining.`
    );
  }
}

export async function incrementUsage(userId: string, leads: number, searches = 1) {
  const subscription = await getSubscriptionForUser(userId);
  const period = usagePeriodFor(subscription);
  const plan =
    (await getEffectivePlan(subscription)) ??
    (await prisma.plan.findUnique({ where: { slug: "starter" } }));
  if (!plan) throw new Error("Plan not configured");

  if (!isBillingEnforced()) {
    await prisma.usageRecord.upsert({
      where: { userId_periodStart: { userId, periodStart: period.start } },
      create: {
        userId,
        periodStart: period.start,
        periodEnd: period.end,
        leadsUsed: leads,
        searchesUsed: searches,
      },
      update: {
        leadsUsed: { increment: leads },
        searchesUsed: { increment: searches },
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const usage = await tx.usageRecord.findUnique({
      where: { userId_periodStart: { userId, periodStart: period.start } },
    });

    if (!usage) {
      throw new Error("Usage record missing");
    }

    if (usage.searchesUsed + searches > plan.searchesPerMonth) {
      throw new UsageLimitError("Search limit reached.");
    }

    if (usage.leadsUsed + leads > plan.leadsPerMonth) {
      throw new UsageLimitError("Lead limit would be exceeded.");
    }

    await tx.usageRecord.update({
      where: { userId_periodStart: { userId, periodStart: period.start } },
      data: {
        leadsUsed: { increment: leads },
        searchesUsed: { increment: searches },
      },
    });
  });
}
