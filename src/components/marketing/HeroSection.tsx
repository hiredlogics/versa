"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { ProductMockup } from "./ProductMockup";
import { BRAND } from "@/config/brand";
import { VersaBackground } from "@/components/brand/VersaBackground";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-28 px-4">
      <VersaBackground fixed={false} variant="default" className="-z-10" showScanline />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
          <div>
            <motion.p
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-lp-border bg-lp-panel px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-lp-muted"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-lp-ice-blue shadow-[0_0_8px_rgba(187,215,255,0.6)]" />
              AI-native B2B lead intelligence
            </motion.p>

            <motion.h1
              className="text-[2.5rem] sm:text-5xl md:text-6xl lg:text-[4rem] xl:text-[4.75rem] font-bold tracking-[-0.03em] leading-[1.04] text-lp-white"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08 }}
            >
              {BRAND.headline.replace("qualified pipeline.", "")}
              <span className="text-gradient-premium">qualified pipeline.</span>
            </motion.h1>

            <motion.p
              className="mt-6 text-base md:text-lg text-lp-muted max-w-xl leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.16 }}
            >
              {BRAND.longTagline}
            </motion.p>

            <motion.div
              className="mt-8 flex flex-col sm:flex-row gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.24 }}
            >
              <Link
                href="/register"
                className="lp-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm btn-lift"
              >
                Start finding leads
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/features"
                className="lp-btn-secondary inline-flex items-center justify-center px-7 py-3.5 text-sm btn-lift"
              >
                See how it works
              </Link>
            </motion.div>

            <motion.div
              className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-lp-muted-dark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {[
                "Apollo enrichment",
                "AI scoring 1–10",
                "Multi-model fallback",
              ].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-lp-ice-blue/80" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>

          <motion.div
            className="relative lg:pl-4"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <ProductMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
