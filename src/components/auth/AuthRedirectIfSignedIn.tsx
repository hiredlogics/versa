"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AuthRedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    const params = new URLSearchParams(window.location.search);
    const sessionExpired = params.get("reason") === "session_expired";

    if (sessionExpired && isSignedIn) {
      void signOut({ redirectUrl: "/login" }).finally(() => setChecking(false));
      return;
    }

    if (!isSignedIn) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;

        if (!token) {
          await signOut({ redirectUrl: "/login?reason=session_expired" });
          return;
        }

        router.replace("/auth/continue");
      } catch {
        if (!cancelled) {
          await signOut({ redirectUrl: "/login?reason=session_expired" });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, router, signOut]);

  if (!isLoaded || checking || isSignedIn) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-sm text-lp-muted">
          {isSignedIn ? "Redirecting to your workspace…" : "Loading…"}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
