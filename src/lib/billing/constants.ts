import type { SubscriptionStatus } from "@prisma/client";

export const CHECKOUT_PLAN_SLUGS = ["starter", "pro", "agency"] as const;
export type CheckoutPlanSlug = (typeof CHECKOUT_PLAN_SLUGS)[number];

export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING"];

export const INACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "CANCELED",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "PAST_DUE",
  "UNPAID",
  "PAUSED",
];

export const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  paused: "PAUSED",
};

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Set BILLING_ENFORCE=true when Stripe is configured and you want paid access + usage gates. */
export function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCE === "true";
}
