"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";

function BillingSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [message, setMessage] = useState("Confirming your subscription…");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    async function pollStatus() {
      attempts += 1;
      try {
        const res = await fetch("/api/billing/status");
        const data = await res.json();
        if (data.hasActiveSubscription) {
          setReady(true);
          setMessage("Subscription active. Opening your workspace…");
          router.replace("/app");
          return;
        }
      } catch {
        // retry
      }

      if (attempts >= 12) {
        setMessage("Payment received. Your workspace is still being set up. This can take a moment.");
        return;
      }

      if (!cancelled) {
        setTimeout(pollStatus, 1500);
      }
    }

    if (sessionId) {
      void pollStatus();
    } else {
      setMessage("Missing checkout session. You can retry from pricing.");
    }

    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center">
        {!ready && <Loader2 className="mb-4 h-8 w-8 animate-spin text-lp-ice-blue" />}
        <h1 className="text-2xl font-bold text-lp-white">Payment successful</h1>
        <p className="mt-3 text-sm text-lp-muted">{message}</p>
        <div className="mt-6 flex w-full flex-col gap-3">
          <Link href="/app" className="auth-submit-btn flex w-full items-center justify-center btn-lift">
            Go to workspace
          </Link>
          <Link href="/pricing" className="text-sm text-lp-ice-blue hover:underline">
            Back to pricing
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-lp-black px-4 py-16">
      <div className="mx-auto max-w-md">
        <Suspense
          fallback={
            <AuthCard>
              <div className="flex flex-col items-center text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-lp-ice-blue" />
                <p className="text-sm text-lp-muted">Loading checkout status…</p>
              </div>
            </AuthCard>
          }
        >
          <BillingSuccessContent />
        </Suspense>
      </div>
    </div>
  );
}
