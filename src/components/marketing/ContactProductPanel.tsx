"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SAMPLE_LEADS } from "./constants";

const STEPS = [
  { label: "Prompt parsed", done: true },
  { label: "Apollo search ready", done: true },
  { label: "AI scoring enabled", done: true },
  { label: "Qualified leads saved", done: false },
  { label: "Export ready", done: false },
];

export function ContactProductPanel() {
  const [scanRow, setScanRow] = useState(0);
  const [activeStep, setActiveStep] = useState(2);

  useEffect(() => {
    const rowTimer = setInterval(() => setScanRow((r) => (r + 1) % 3), 2400);
    const stepTimer = setInterval(() => setActiveStep((s) => (s + 1) % STEPS.length), 3200);
    return () => {
      clearInterval(rowTimer);
      clearInterval(stepTimer);
    };
  }, []);

  return (
    <motion.div
      className="lp-glass-panel h-full rounded-2xl border border-lp-border p-5 md:p-6"
      initial={{ opacity: 0, x: 24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-lp-muted-dark mb-3">Live workflow preview</p>
      <div className="rounded-xl border border-lp-border bg-lp-graphite/80 p-3 mb-4">
        <p className="text-xs text-lp-muted mb-1">Prompt</p>
        <p className="text-sm text-lp-off-white leading-relaxed">
          Find B2B SaaS founders in the US with 20–300 employees.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {STEPS.map((step, i) => (
          <span
            key={step.label}
            className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
              i <= activeStep
                ? "border-lp-ice-blue/40 bg-lp-ice-blue/10 text-lp-ice-blue"
                : "border-lp-border text-lp-muted-dark"
            }`}
          >
            {step.label}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-lp-border relative">
        <div className="grid grid-cols-[1.2fr_1fr_0.6fr] gap-2 border-b border-lp-border bg-lp-panel px-3 py-2 text-[10px] uppercase tracking-wider text-lp-muted-dark">
          <span>Name</span>
          <span>Company</span>
          <span className="text-right">Score</span>
        </div>
        {SAMPLE_LEADS.slice(0, 3).map((lead, i) => (
          <div
            key={lead.name}
            className={`relative grid grid-cols-[1.2fr_1fr_0.6fr] gap-2 px-3 py-2.5 text-xs border-b border-lp-border/50 last:border-0 transition-colors ${
              scanRow === i ? "bg-lp-ice-blue/5" : ""
            }`}
          >
            {scanRow === i && (
              <motion.div
                className="absolute inset-y-0 left-0 w-px bg-lp-ice-blue"
                layoutId="contact-scan"
              />
            )}
            <div>
              <p className="font-medium text-lp-white">{lead.name}</p>
              <p className="text-lp-muted-dark text-[10px]">{lead.title}</p>
            </div>
            <span className="text-lp-muted truncate self-center">{lead.company}</span>
            <span className="text-right font-semibold text-lp-success self-center">{lead.score}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["Apollo enriched", "AI scored", "Secure workspace"].map((pill) => (
          <span key={pill} className="text-[10px] text-lp-muted border border-lp-border rounded-full px-2 py-0.5">
            {pill}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
