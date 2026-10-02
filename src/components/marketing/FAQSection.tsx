"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const FAQS = [
  {
    q: "How does prompt search work?",
    a: `You describe your ideal customer in plain language. ${BRAND.name} turns that into a focused search across millions of B2B profiles and scores every result against your criteria.`,
  },
  {
    q: "How reliable is the scoring?",
    a: "Every lead gets a score from 1 to 10 with a short reason, so you can check the logic yourself instead of trusting a bare number.",
  },
  {
    q: "What data do I get for each lead?",
    a: "Name, job title, company, industry, company size, location and LinkedIn profile, plus a work email when one is available.",
  },
  {
    q: "Can I export leads to my CRM?",
    a: "Yes. Export to CSV on all plans. Paid plans include Excel export and saved lead lists for repeatable workflows.",
  },
  {
    q: "Is there a free trial?",
    a: "There's no free trial. Creating an account is free; choose a plan to start searching, and change plans whenever you need more.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SectionShell soft id="faq">
      <SectionHeader badge="FAQ" title="Questions, answered" />
      <div className="max-w-3xl mx-auto space-y-3">
        {FAQS.map((faq, i) => (
          <FadeIn key={faq.q} delay={i * 0.05}>
            <div className="rounded-xl border border-lp-border bg-lp-panel overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="text-sm font-medium text-lp-white">{faq.q}</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 shrink-0 text-lp-muted transition-transform",
                    open === i && "rotate-180"
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-300",
                  open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm text-lp-muted leading-relaxed">{faq.a}</p>
                </div>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
