"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { FadeIn } from "./AnimatedAurora";
import { BRAND } from "@/config/brand";

const FAQS = [
  {
    q: "How quickly will you respond?",
    a: "We typically respond within one business day. Enterprise inquiries receive priority routing.",
  },
  {
    q: "Can I see a product demo?",
    a: "Yes — describe your ideal customer in the form and we'll tailor a walkthrough to it.",
  },
  {
    q: "Do you support agencies and multi-client workflows?",
    a: `${BRAND.name} supports agency plans with team workspaces, saved lists, and advanced exports.`,
  },
  {
    q: "Is my data secure?",
    a: "Yes. Workspace data is encrypted and kept separate from every other account.",
  },
];

export function ContactFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-16 md:py-20 px-4">
      <div className="mx-auto max-w-3xl">
        <FadeIn>
          <h2 className="text-2xl font-bold text-lp-white text-center mb-8">What to expect</h2>
        </FadeIn>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <FadeIn key={faq.q} delay={i * 0.05}>
              <div className="rounded-xl border border-lp-border bg-lp-panel overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                >
                  <span className="text-sm font-medium text-lp-off-white">{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-lp-muted transition-transform",
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
      </div>
    </section>
  );
}
