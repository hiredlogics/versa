import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

const TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = {
  data: UserLeadContextDTO;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();

export function contextCacheKey(userId: string): string {
  return `user-lead-context:${userId}`;
}

export function getCachedUserLeadContext(userId: string): UserLeadContextDTO | null {
  const entry = store.get(contextCacheKey(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(contextCacheKey(userId));
    return null;
  }
  return entry.data;
}

export function setCachedUserLeadContext(userId: string, data: UserLeadContextDTO): void {
  store.set(contextCacheKey(userId), {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateUserLeadContext(userId: string): void {
  store.delete(contextCacheKey(userId));
}

/** Test helper */
export function clearContextCache(): void {
  store.clear();
}
