"use client";

import { motion } from "framer-motion";
import { FadeIn } from "./AnimatedAurora";
import { BRAND } from "@/config/brand";

export function ContactHero() {
  return (
    <section className="relative pt-28 pb-12 md:pt-32 md:pb-16 px-4 overflow-hidden">
      <FadeIn className="mx-auto max-w-6xl text-center md:text-left">
        <p className="mb-4 inline-flex items-center rounded-full border border-lp-border bg-lp-panel px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-lp-muted">
          Talk to {BRAND.name}
        </p>
        <h1 className="text-3xl md:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-lp-white leading-[1.1] max-w-3xl">
          Let&apos;s build your next qualified pipeline.
        </h1>
        <p className="mt-5 text-base md:text-lg text-lp-muted max-w-2xl leading-relaxed">
          Tell us what market you are targeting. We&apos;ll help you understand how {BRAND.name} can find,
          enrich, score, and save the B2B leads that fit you best.
        </p>
      </FadeIn>
    </section>
  );
}
