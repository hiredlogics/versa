import { USER_STOPPED_MESSAGE } from "@/lib/services/leads/searchControl";

/**
 * Turn a raw job error into copy that is safe for the client app: no provider
 * name, no HTTP status codes, no API-key hints. Raw text stays in server logs.
 */
export function toUserFacingSearchError(raw: string | null | undefined): string {
  const message = (raw || "").trim();
  if (!message) return "Search failed. Please try again.";
  if (message === USER_STOPPED_MESSAGE) return message;

  if (/invalid api key|unauthorized|forbidden|\b(401|403)\b/i.test(message)) {
    return "Lead search is temporarily unavailable. Our data provider rejected the request. The team has been notified.";
  }
  if (/not configured/i.test(message)) {
    return "Lead search is not configured on this server yet. The team has been notified.";
  }
  if (/credit/i.test(message)) {
    return "We can't look up more people right now. Please try again later, then click Get next 100.";
  }
  if (/rate limit|\b429\b/i.test(message)) {
    return "We are being rate limited right now. Please try again in a few minutes.";
  }
  if (/timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(message)) {
    return "The lead search timed out. Anything already saved is kept. Click Get next 100 to continue.";
  }

  return message.replace(/apollo(\.io)?/gi, "the data provider");
}
