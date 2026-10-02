"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SAMPLE_LEADS } from "./constants";
import { SignalCard } from "./SignalCard";

const CRITERIA = ["SaaS founders", "United States", "20–300 employees", "AI automation intent"];

export function ProductMockup() {
  const [scanRow, setScanRow] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setScanRow((r) => (r + 1) % SAMPLE_LEADS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-lp-ice-blue/20 via-transparent to-lp-cold-blue/20 blur-2xl" aria-hidden />

      <motion.div
        className="relative glass-panel-strong rounded-2xl border border-lp-border p-4 md:p-5 shadow-2xl"
        initial={{ opacity: 0, y: 32, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-lp-success/80" />
          </div>
          <span className="text-xs text-lp-muted-dark ml-2">Lead search · live preview</span>
        </div>

        <div className="rounded-xl border border-lp-border bg-lp-black/80 p-3">
          <p className="text-[10px] uppercase tracking-wider text-lp-muted-dark mb-1.5">Your prompt</p>
          <p className="text-sm text-lp-white leading-relaxed">
            Find SaaS founders in the US with 20–300 employees who may need AI automation.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {CRITERIA.map((chip, i) => (
            <motion.span
              key={chip}
              className="rounded-full border border-lp-ice-blue/30 bg-lp-ice-blue/10 px-2.5 py-1 text-xs text-lp-ice-blue"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
            >
              {chip}
            </motion.span>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-lp-border">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_0.6fr] gap-2 border-b border-lp-border bg-lp-panel px-3 py-2 text-[10px] uppercase tracking-wider text-lp-muted-dark">
            <span>Name</span>
            <span className="hidden sm:inline">Title</span>
            <span>Company</span>
            <span className="text-right">Score</span>
          </div>
          {SAMPLE_LEADS.map((lead, i) => (
            <div
              key={lead.name}
              className={`relative grid grid-cols-[1.2fr_1fr_1fr_0.6fr] gap-2 px-3 py-2.5 text-xs border-b border-lp-border/50 last:border-0 transition-colors ${
                scanRow === i ? "bg-lp-ice-blue/10" : "bg-transparent"
              }`}
            >
              {scanRow === i && (
                <motion.div
                  className="absolute inset-y-0 left-0 w-0.5 bg-lp-cold-blue"
                  layoutId="scan-line"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="font-medium text-lp-white truncate">{lead.name}</span>
              <span className="hidden sm:inline text-lp-muted truncate">{lead.title}</span>
              <span className="text-lp-muted truncate">{lead.company}</span>
              <span className="text-right font-semibold text-lp-success">{lead.score}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-lp-muted">4 qualified · 4 enriched</span>
          <span className="rounded-full bg-lp-success/15 px-2 py-0.5 text-lp-success">Export ready</span>
        </div>
      </motion.div>

      <SignalCard label="Score" value="9.4" accent="emerald" className="absolute -left-2 top-8 md:-left-8" delay={0.6} />
      <SignalCard label="Match" value="Founder matched" accent="violet" className="absolute -right-2 top-20 md:-right-6" delay={0.9} />
      <SignalCard label="Signal" value="AI automation" accent="cyan" className="absolute -left-4 bottom-24 md:-left-10" delay={1.2} />
      <SignalCard label="Data" value="Verified data" accent="blue" className="absolute -right-3 bottom-16 md:-right-8" delay={1.5} />
    </div>
  );
}
