import { getAppUrl } from "./constants";
import { getStripe } from "./stripe";

export async function createBillingPortalSession(stripeCustomerId: string) {
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${getAppUrl()}/app/billing`,
  });

  if (!session.url) throw new Error("Stripe billing portal URL missing.");
  return session;
}
