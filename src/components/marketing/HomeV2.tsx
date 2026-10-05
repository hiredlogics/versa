"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { BRAND } from "@/config/brand";
import { VersaBackground } from "@/components/brand/VersaBackground";
import { AnimatedAurora, FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { PricingPlanButton } from "./PricingPlanButton";
import type { CheckoutPlanSlug } from "@/lib/billing/constants";

const STEPS = [
  { num: "01", title: "Describe your buyer", desc: "Write who you want to reach in plain language." },
  { num: "02", title: "Review the matches", desc: "See a focused list of people and companies that fit." },
  { num: "03", title: "Prioritize the right people", desc: "Use scores and reasons to decide where to start." },
  { num: "04", title: "Take the next step", desc: "Save your context and return when you are ready." },
];

const FEATURES = [
  { title: "Ranked 1–10", desc: "See the strongest matches first, with a clear score for every lead." },
  { title: "Explained, not a black box", desc: "Every recommendation includes a concise reason it fits your buyer." },
  { title: "Verified contacts", desc: "Start with contact details you can use with confidence." },
  { title: "Saved context", desc: "Keep your buyer definition close so each new search starts smarter." },
];

const USE_CASES = [
  { tag: "Founders", title: "Founder-led sales", desc: "Build an early, focused list of buyers without losing time to research." },
  { tag: "Revenue teams", title: "Outbound teams", desc: "Give reps a ranked starting point for thoughtful outreach." },
  { tag: "Agencies", title: "Agencies", desc: "Find the right decision-makers for each client engagement." },
  { tag: "Growth", title: "Market research", desc: "Explore new audiences and see who matches a new point of view." },
];

const PLANS: Array<{
  name: string;
  price: string;
  desc: string;
  features: string[];
  cta: string;
  planSlug?: CheckoutPlanSlug;
  highlight?: boolean;
}> = [
  {
    name: "Free Trial",
    price: "$0",
    desc: "A focused way to try VARSA.",
    features: ["25 free leads, one time", "3 searches", "Ranked results", "CSV export"],
    cta: "Start free",
  },
  {
    name: "Starter",
    price: "$49",
    desc: "For individuals building pipeline.",
    features: ["500 leads/month", "50 searches/month", "AI lead scoring", "CSV & Excel export"],
    cta: "Get Starter",
    planSlug: "starter",
  },
  {
    name: "Pro",
    price: "$149",
    desc: "For teams that prospect every day.",
    features: ["2,500 leads/month", "250 searches/month", "Advanced scoring", "Saved lead lists"],
    cta: "Get Pro",
    planSlug: "pro",
    highlight: true,
  },
  {
    name: "Agency",
    price: "$399",
    desc: "For teams serving multiple clients.",
    features: ["10,000 leads/month", "1,000 searches/month", "Team workspace", "Priority support"],
    cta: "Get Agency",
    planSlug: "agency",
  },
];

const FAQS = [
  { q: "What does VARSA do?", a: "VARSA turns a description of your buyer into a ranked list of B2B leads, with a clear reason for every match." },
  { q: "How do I start?", a: "Describe the people and companies you want to reach, then review the ranked results and decide where to focus." },
  { q: "What does the score mean?", a: "Scores run from 1–10 and help you compare fit. The explanation beside each score gives the useful context." },
  { q: "Are contacts verified?", a: "Results label verified email availability so you can quickly understand what is ready for outreach." },
  { q: "Can I save my buyer context?", a: "Yes. VARSA keeps your buyer context available for your next search." },
  { q: "Is there a free trial?", a: "Yes. Every new account gets 25 free leads and 3 searches, once. After that, choose a plan to keep searching." },
];

const SAMPLE_LEADS = [
  { name: "Maya Chen", title: "Founder", company: "Northstar", reason: "Building a sales team", score: "9.6" },
  { name: "Daniel Brooks", title: "VP Revenue", company: "Crescent", reason: "Hiring for growth", score: "9.2" },
  { name: "Priya Shah", title: "COO", company: "Fieldwork", reason: "Owns the buying motion", score: "8.9" },
  { name: "Aaron Miller", title: "CEO", company: "Relay", reason: "Matches company profile", score: "8.6" },
];

function SampleResultsCard() {
  return (
    <motion.div
      className="relative rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow"
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="text-[10px] uppercase tracking-wider text-lp-ice-blue">Sample results</p>
      <div className="mt-4 rounded-xl border border-lp-border bg-lp-panel-strong p-4">
        <p className="text-[11px] uppercase tracking-wide text-lp-muted-dark">Buyer description</p>
        <p className="mt-1 text-sm text-lp-white">
          Founders and revenue leaders at growing B2B software companies.
        </p>
      </div>
      <div className="mt-2 divide-y divide-lp-border">
        {SAMPLE_LEADS.map((lead) => (
          <div key={lead.name} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-semibold text-lp-white">{lead.name}</p>
              <p className="text-xs text-lp-muted">
                {lead.title} · {lead.company}
              </p>
              <p className="mt-0.5 text-xs text-lp-success">{lead.reason}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-lp-success">Verified email</p>
              <p className="font-mono text-lg font-bold text-lp-white">{lead.score}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-28 md:pb-20 md:pt-36">
      <VersaBackground fixed={false} variant="default" className="-z-10" showScanline />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-10">
        <div>
          <motion.p
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-lp-border bg-lp-panel px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-lp-muted"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-lp-ice-blue shadow-[0_0_8px_rgba(187,215,255,0.6)]" />
            B2B lead intelligence
          </motion.p>

          <motion.h1
            className="text-[2.5rem] font-bold leading-[1.04] tracking-[-0.03em] text-lp-white sm:text-5xl md:text-6xl lg:text-[4rem] xl:text-[4.75rem]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08 }}
          >
            Describe your buyer. <span className="text-gradient-premium">Get a ranked list.</span>
          </motion.h1>

          <motion.p
            className="mt-6 max-w-xl text-base leading-relaxed text-lp-muted md:text-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.16 }}
          >
            Turn a clear point of view into a practical list of people to contact. {BRAND.name} ranks each
            lead and explains why it belongs there.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.24 }}
          >
            <Link
              href="/register"
              className="lp-btn-primary btn-lift inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm"
            >
              Start finding leads
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href="#how"
              className="lp-btn-secondary btn-lift inline-flex items-center justify-center px-7 py-3.5 text-sm"
            >
              See how it works
            </a>
          </motion.div>

          <motion.p
            className="mt-6 text-xs text-lp-muted-dark"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Start free with 25 leads. No card needed.
          </motion.p>
        </div>

        <div className="relative lg:pl-4">
          <SampleResultsCard />
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <SectionShell id="how">
      <SectionHeader
        badge="How it works"
        title="From a point of view to a list you can use"
        subtitle="Four steps, no manual list building required."
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <FadeIn key={step.num} delay={i * 0.1}>
            <div className="relative h-full rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow">
              <span className="text-3xl font-bold text-lp-ice-blue/30">{step.num}</span>
              <h3 className="mt-4 text-base font-semibold text-lp-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-lp-muted">{step.desc}</p>
              {i < STEPS.length - 1 && (
                <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-lp-border lg:block" aria-hidden />
              )}
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}

function FeaturesSection() {
  return (
    <SectionShell soft>
      <SectionHeader
        badge="What you get"
        title="Useful signals, kept simple"
        subtitle="Everything points at one thing: who to talk to next."
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <FadeIn key={f.title} delay={i * 0.08}>
            <div className="h-full rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow">
              <Check className="mb-4 h-7 w-7 text-lp-ice-blue" aria-hidden />
              <h3 className="font-semibold text-lp-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-lp-muted">{f.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}

function UseCasesSection() {
  return (
    <SectionShell id="use-cases">
      <SectionHeader
        badge="Use cases"
        title="For teams with a clear next customer"
        subtitle={`Whether you're a founder, agency, or growth lead — ${BRAND.name} adapts to how you prospect.`}
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {USE_CASES.map((uc, i) => (
          <FadeIn key={uc.title} delay={i * 0.08}>
            <Link
              href="/use-cases"
              className="group block h-full rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow transition-all hover:border-lp-ice-blue/30"
            >
              <span className="text-[10px] uppercase tracking-wider text-lp-ice-blue">{uc.tag}</span>
              <h3 className="mt-3 text-lg font-semibold text-lp-white transition-colors group-hover:text-lp-ice-blue">
                {uc.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-lp-muted">{uc.desc}</p>
            </Link>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}

function PricingSection() {
  return (
    <SectionShell soft id="pricing">
      <SectionHeader
        badge="Pricing"
        title="Choose room to grow"
        subtitle="Start with the free trial. Change plans whenever your work calls for more."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan, i) => (
          <FadeIn key={plan.name} delay={i * 0.08}>
            <div
              className={cn(
                "relative flex h-full flex-col rounded-2xl border p-6 transition-all",
                plan.highlight
                  ? "scale-[1.02] border-lp-ice-blue/50 bg-gradient-to-b from-lp-ice-blue/10 to-lp-panel shadow-[0_0_40px_rgba(187,215,255,0.1)]"
                  : "border-lp-border bg-lp-panel card-glow"
              )}
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
                {plan.price !== "$0" && <span className="text-sm font-normal text-lp-muted">/mo</span>}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-lp-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lp-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <PricingPlanButton planSlug={plan.planSlug} cta={plan.cta} highlight={plan.highlight} />
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <SectionShell id="faq">
      <SectionHeader badge="FAQ" title="Questions, answered plainly" />
      <div className="mx-auto max-w-3xl space-y-3">
        {FAQS.map((faq, i) => (
          <FadeIn key={faq.q} delay={i * 0.05}>
            <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-panel">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="text-sm font-medium text-lp-white">{faq.q}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-lp-muted transition-transform",
                    open === i && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-300",
                  open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm leading-relaxed text-lp-muted">{faq.a}</p>
                </div>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}

function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-lp-border bg-lp-black px-4 py-16 md:py-24">
      <AnimatedAurora />
      <FadeIn className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-lp-white md:text-5xl">
          Find the people worth talking to next
        </h2>
        <p className="mt-4 text-base text-lp-muted md:text-lg">
          Bring your point of view. Leave with a ranked, explained starting point.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" className="lp-btn-primary btn-lift px-8 py-3.5 text-sm">
            Start finding leads
          </Link>
          <Link href="/pricing" className="lp-btn-secondary btn-lift px-8 py-3.5 text-sm">
            View pricing
          </Link>
        </div>
      </FadeIn>
    </section>
  );
}

export function HomeV2() {
  return (
    <>
      <Hero />
      <HowItWorksSection />
      <FeaturesSection />
      <UseCasesSection />
      <PricingSection />
      <FAQSection />
      <FinalCtaSection />
    </>
  );
}
