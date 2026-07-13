"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { BRAND } from "@/config/brand";
import { UseCasesProductVisual } from "./UseCasesProductVisual";

const ease = [0.16, 1, 0.3, 1] as const;

export function UseCasesHero() {
  return (
    <section className="varsa-editorial-hero relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <motion.p
              className="varsa-editorial-badge mb-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
            >
              Use cases
            </motion.p>

            <motion.h1
              className="varsa-editorial-display text-[var(--varsa-editorial-text)]"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08, ease }}
            >
              Find the buyers your business should talk to.
            </motion.h1>

            <motion.p
              className="mt-6 max-w-xl text-lg md:text-xl leading-relaxed text-[var(--varsa-editorial-muted)]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.16, ease }}
            >
              {BRAND.fullName} helps teams turn vague market ideas, ICP context, and buyer criteria into
              enriched, scored, outreach-ready leads.
            </motion.p>

            <motion.div
              className="mt-8 flex flex-col sm:flex-row gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.24, ease }}
            >
              <Link href="/register" className="varsa-editorial-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold">
                Start finding leads
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/features" className="varsa-editorial-btn-secondary inline-flex items-center justify-center px-7 py-3.5 text-sm font-semibold">
                See how it works
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.32, ease }}
          >
            <UseCasesProductVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
