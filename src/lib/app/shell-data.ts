import { getLegacyUsageSummary } from "@/lib/billing/billingDashboard";
import { isBillingEnforced } from "@/lib/billing/constants";
import { getSubscriptionForUser, isActiveSubscription } from "@/lib/billing/subscription";
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
  const isActive = billingEnforced ? isActiveSubscription(subscription) : true;

  return {
    planName: subscription?.planName ?? subscription?.plan.name ?? "Plan",
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
