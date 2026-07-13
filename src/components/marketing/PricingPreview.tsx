import Link from "next/link";
import { FadeIn } from "./AnimatedAurora";
import { PricingPlanButton } from "./PricingPlanButton";
import { SectionHeader, SectionShell } from "./SectionShell";
import type { CheckoutPlanSlug } from "@/lib/billing/constants";

const PLANS: Array<{
  name: string;
  price: string;
  desc: string;
  features: string[];
  cta: string;
  planSlug?: CheckoutPlanSlug;
  highlight: boolean;
  contactSales?: boolean;
  href?: string;
}> = [
  {
    name: "Free Trial",
    price: "$0",
    desc: "Create your account, then choose a plan to unlock the workspace",
    features: ["Account + workspace setup", "Secure Clerk auth", "Upgrade anytime", "Stripe-managed billing"],
    cta: "Create account",
    href: "/register",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$49",
    desc: "For solo founders and small teams",
    features: ["500 leads/month", "50 searches/month", "AI lead scoring", "CSV & Excel export", "Search history"],
    cta: "Get Starter",
    planSlug: "starter",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$149",
    desc: "For teams running outbound at scale",
    features: [
      "2,500 leads/month",
      "250 searches/month",
      "Advanced AI scoring",
      "Saved lead lists",
      "Priority processing",
    ],
    cta: "Get Pro",
    planSlug: "pro",
    highlight: true,
  },
  {
    name: "Agency",
    price: "$399",
    desc: "For agencies and multi-client workflows",
    features: [
      "10,000 leads/month",
      "Team workspace",
      "Admin analytics",
      "Priority support",
      "Advanced exports",
    ],
    cta: "Get Agency",
    planSlug: "agency",
    highlight: false,
  },
];

export function PricingPreview() {
  return (
    <SectionShell soft id="pricing">
      <SectionHeader
        badge="Pricing"
        title="Simple plans. Serious pipeline."
        subtitle="Authenticate with Clerk, subscribe through Stripe, then run lead searches from one intelligent prompt."
      />
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {PLANS.map((plan, i) => (
          <FadeIn key={plan.name} delay={i * 0.08}>
            <div
              className={`relative flex h-full flex-col rounded-2xl border p-6 transition-all ${
                plan.highlight
                  ? "border-lp-ice-blue/50 bg-gradient-to-b from-lp-ice-blue/10 to-lp-panel shadow-[0_0_40px_rgba(187,215,255,0.1)] scale-[1.02]"
                  : "border-lp-border bg-lp-panel card-glow"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-lp-ice-blue px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lp-black">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-lp-white">{plan.name}</h3>
              <p className="mt-1 text-xs text-lp-muted">{plan.desc}</p>
              <p className="mt-4 text-4xl font-bold text-lp-white">
                {plan.price}
                <span className="text-sm font-normal text-lp-muted">/mo</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-lp-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lp-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <PricingPlanButton
                  planSlug={plan.planSlug}
                  cta={plan.cta}
                  highlight={plan.highlight}
                  href={plan.href}
                  contactSales={plan.contactSales}
                />
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-lp-muted-dark">
        Already subscribed?{" "}
        <Link href="/app/billing" className="text-lp-ice-blue hover:underline">
          Manage billing
        </Link>
      </p>
    </SectionShell>
  );
}

export { PricingPreview as PricingCards };
