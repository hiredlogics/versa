"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearRestoreSearchId } from "@/lib/search-restore";

export const AUTH_SESSION_CHANGED = "auth:session-changed";

function notifySessionChanged() {
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED));
}

/**
 * Clears client caches when auth changes. Does not navigate, middleware and
 * server layouts handle route protection to avoid redirect loops with Clerk.
 */
export function AuthSessionSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      if (prevUserIdRef.current) {
        clearRestoreSearchId();
        notifySessionChanged();
      }
      prevUserIdRef.current = null;
      return;
    }

    const prevUserId = prevUserIdRef.current;
    if (prevUserId !== undefined && prevUserId !== userId) {
      clearRestoreSearchId();
      notifySessionChanged();
      router.refresh();
    }

    prevUserIdRef.current = userId ?? null;
  }, [isLoaded, isSignedIn, userId, router]);

  return null;
}
