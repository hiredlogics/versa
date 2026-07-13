import { isBillingEnforced } from "@/lib/billing/constants";
import { getApiKeysStatus } from "@/lib/env";

export function getPlatformReadiness() {
  const providers = getApiKeysStatus();
  return {
    apollo: providers.apollo,
    ai: providers.ai,
    aiProvider: providers.provider,
    leadSearchReady: providers.apollo,
    billingEnforced: isBillingEnforced(),
  };
}

export function assertApolloConfigured() {
  const { apollo } = getPlatformReadiness();
  if (!apollo) {
    throw new Error("Apollo provider is not configured on the server.");
  }
}
