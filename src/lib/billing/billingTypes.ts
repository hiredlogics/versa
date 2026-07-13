import type { CheckoutPlanKey } from "./planLimits";

export type LeadSearchAccessCode =
  | "NO_ACTIVE_SUBSCRIPTION"
  | "LEAD_LIMIT_REACHED"
  | "SEARCH_LIMIT_REACHED";

export interface UsageSnapshot {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  leadsUsed: number;
  leadsLimit: number;
  leadsRemaining: number;
  searchesUsed: number;
  searchesLimit: number;
  searchesRemaining: number;
  leadsPercent: number;
  searchesPercent: number;
  usageExceededPlan: boolean;
}

export interface AvailablePlan {
  key: CheckoutPlanKey;
  name: string;
  monthlyLeads: number;
  monthlySearches: number;
  features: string[];
  isCurrent: boolean;
}

export interface FullBillingStatus {
  planName: CheckoutPlanKey | "freeTrial" | null;
  planSlug: string | null;
  displayPlanName: string | null;
  subscriptionStatus: string | null;
  isActive: boolean;
  hasActiveSubscription: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  usage: UsageSnapshot;
  availablePlans: AvailablePlan[];
}
