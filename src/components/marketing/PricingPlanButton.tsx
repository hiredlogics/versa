"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CheckoutPlanSlug } from "@/lib/billing/constants";

const billingEnforced = process.env.NEXT_PUBLIC_BILLING_ENFORCE === "true";

type PricingPlanButtonProps = {
  planSlug?: CheckoutPlanSlug;
  cta: string;
  highlight?: boolean;
  href?: string;
  contactSales?: boolean;
};

export function PricingPlanButton({
  planSlug,
  cta,
  highlight,
  href = "/register",
  contactSales,
}: PricingPlanButtonProps) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (!planSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setLoading(false);
    }
  }

  function handleClick() {
    if (contactSales) {
      router.push(href);
      return;
    }

    const planQuery = planSlug ? `?plan=${planSlug}` : "";

    // Dev / pre-Stripe: register → app (no checkout)
    if (!billingEnforced) {
      router.push(isSignedIn ? "/app" : `/register${planQuery}`);
      return;
    }

    if (planSlug === undefined) {
      router.push(isSignedIn ? "/app" : `${href}${href.includes("?") ? "&" : "?"}plan=free-trial`);
      return;
    }

    if (!isSignedIn) {
      router.push(`/register${planQuery}`);
      return;
    }

    void handleCheckout();
  }

  return (
    <div>
      <Button
        variant={highlight ? "primary" : "secondary"}
        className="w-full btn-lift"
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? "Redirecting…" : cta}
      </Button>
      {error && (
        <p className="mt-2 text-center text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}
      {!isSignedIn && planSlug && !contactSales && (
        <p className="mt-2 text-center text-[11px] text-lp-muted-dark">
          <Link href={`/register?plan=${planSlug}`} className="text-lp-ice-blue hover:underline">
            Or create an account first
          </Link>
        </p>
      )}
    </div>
  );
}
