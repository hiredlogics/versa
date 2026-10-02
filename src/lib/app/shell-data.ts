import { getLegacyUsageSummary } from "@/lib/billing/billingDashboard";
import { isBillingEnforced } from "@/lib/billing/constants";
import { PLAN_LIMITS } from "@/lib/billing/planLimits";
import {
  getSubscriptionForUser,
  isActiveSubscription,
  isOnFreeTrial,
} from "@/lib/billing/subscription";
import { getUserLeadContext } from "@/lib/context/userLeadContext";
import { getPlatformReadiness } from "@/lib/platform-readiness";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

export type AppShellUsage = {
  plan: string;
  leadsUsed: number;
  leadsLimit: number;
  leadsRemaining?: number;
  searchesUsed: number;
  searchesLimit: number;
  usageExceededPlan?: boolean;
  billingEnforced: boolean;
};

export type AppShellPlatformStatus = {
  apollo: boolean;
  ai: boolean;
  leadSearchReady: boolean;
  isAdmin: boolean;
};

export type AppShellData = {
  planName: string;
  isActive: boolean;
  usage: AppShellUsage;
  leadContext: UserLeadContextDTO | null;
  platformStatus: AppShellPlatformStatus;
};

export async function getAppShellData(userId: string, isAdmin: boolean): Promise<AppShellData> {
  const [usage, subscription, leadContext, readiness] = await Promise.all([
    getLegacyUsageSummary(userId),
    getSubscriptionForUser(userId),
    getUserLeadContext(userId),
    Promise.resolve(getPlatformReadiness()),
  ]);

  const billingEnforced = isBillingEnforced();
  const onFreeTrial = isOnFreeTrial(subscription);
  const isActive = billingEnforced ? onFreeTrial || isActiveSubscription(subscription) : true;

  return {
    planName: onFreeTrial
      ? PLAN_LIMITS.freeTrial.name
      : (subscription?.planName ?? subscription?.plan.name ?? "Plan"),
    isActive,
    usage: {
      ...usage,
      billingEnforced,
    },
    leadContext,
    platformStatus: {
      apollo: readiness.apollo,
      ai: readiness.ai,
      leadSearchReady: readiness.leadSearchReady,
      isAdmin,
    },
  };
}
