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
    console.error(
      JSON.stringify({
        scope: "lead-fetch",
        event: "apollo_config_missing",
        at: new Date().toISOString(),
        message: "APOLLO_API_KEY is not set or not readable on the server",
      })
    );
    throw new Error(
      "Apollo provider is not configured on the server. Set APOLLO_API_KEY in the server environment."
    );
  }
}
