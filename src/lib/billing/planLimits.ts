/** Central plan limits — keep in sync with prisma/seed.ts Plan rows */
export const PLAN_LIMITS = {
  freeTrial: {
    slug: "free-trial",
    name: "Free Trial",
    monthlyLeads: 25,
    monthlySearches: 3,
    features: ["Basic AI scoring", "CSV export"],
  },
  starter: {
    slug: "starter",
    name: "Starter",
    monthlyLeads: 500,
    monthlySearches: 50,
    features: ["AI scoring", "CSV export", "Excel export", "Search history"],
  },
  pro: {
    slug: "pro",
    name: "Pro",
    monthlyLeads: 2500,
    monthlySearches: 250,
    features: ["Advanced scoring", "Saved lead lists", "Priority processing"],
  },
  agency: {
    slug: "agency",
    name: "Agency",
    monthlyLeads: 10000,
    monthlySearches: 1000,
    features: ["Team workspace", "Admin analytics", "Priority support"],
  },
} as const;

/**
 * The free trial is a one-time allowance (25 leads, 3 searches in total), not a
 * monthly one. All trial usage is recorded in this single fixed period so it
 * never resets.
 */
export const FREE_TRIAL_PERIOD = {
  start: new Date(Date.UTC(1970, 0, 1)),
  end: new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999)),
  periodKey: "free-trial",
} as const;

export type PlanLimitKey = keyof typeof PLAN_LIMITS;
export type CheckoutPlanKey = Exclude<PlanLimitKey, "freeTrial">;

export const CHECKOUT_PLAN_KEYS: CheckoutPlanKey[] = ["starter", "pro", "agency"];

export function planLimitKeyFromSlug(slug: string | null | undefined): PlanLimitKey | null {
  if (!slug) return null;
  if (slug === "free-trial") return "freeTrial";
  if (slug in PLAN_LIMITS) return slug as PlanLimitKey;
  return null;
}

export function comparePlanTier(a: CheckoutPlanKey, b: CheckoutPlanKey): number {
  const order: CheckoutPlanKey[] = ["starter", "pro", "agency"];
  return order.indexOf(a) - order.indexOf(b);
}
