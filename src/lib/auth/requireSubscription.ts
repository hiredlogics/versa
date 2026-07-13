import { requireActiveSubscription, SubscriptionRequiredError } from "@/lib/billing/subscription";
import { requireUser } from "@/lib/auth/get-current-user";

export { SubscriptionRequiredError };

export async function requireSubscription() {
  const user = await requireUser();
  const subscription = await requireActiveSubscription(user.id);
  return { user, subscription };
}
