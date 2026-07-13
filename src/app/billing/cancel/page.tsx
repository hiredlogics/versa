import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen bg-lp-black px-4 py-16">
      <div className="mx-auto max-w-md">
        <AuthCard>
          <h1 className="text-2xl font-bold text-lp-white">Checkout canceled</h1>
          <p className="mt-3 text-sm leading-relaxed text-lp-muted">
            No charge was made. Choose a plan when you&apos;re ready to unlock the Lead Finder workspace.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link href="/pricing" className="auth-submit-btn flex w-full items-center justify-center btn-lift">
              View pricing
            </Link>
            <Link href="/app/billing" className="text-center text-sm text-lp-ice-blue hover:underline">
              Open billing
            </Link>
          </div>
        </AuthCard>
      </div>
    </div>
  );
}
