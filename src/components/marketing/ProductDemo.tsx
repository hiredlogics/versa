"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const PROMPT =
  "Find SaaS founders in the US with 20–300 employees who may need AI automation.";

const STEPS = [
  { label: "Understanding prompt", detail: "Parsing intent into structured ICP criteria" },
  { label: "Searching Apollo", detail: "Querying millions of B2B profiles" },
  { label: "Enriching contacts", detail: "Emails, titles, company signals" },
  { label: "Scoring leads", detail: "AI ranks fit, urgency, and outreach angle" },
  { label: "Saving qualified leads", detail: "Export-ready list in your workspace" },
];

export function ProductDemo() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setActive((a) => (a + 1) % STEPS.length);
      setProgress(0);
    }, 3200);
    return () => clearInterval(stepTimer);
  }, []);

  useEffect(() => {
    const progTimer = setInterval(() => {
      setProgress((p) => Math.min(p + 4, 100));
    }, 120);
    return () => clearInterval(progTimer);
  }, [active]);

  return (
    <SectionShell id="demo" soft>
      <SectionHeader
        badge="Live flow"
        title="Prompt in. Qualified leads out."
        subtitle={`Watch ${BRAND.name} transform a single sentence into ranked, enriched buyers — without manual list building.`}
      />

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        <motion.div
          className="glass-panel rounded-2xl border border-lp-border p-5 md:p-6"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-xs uppercase tracking-wider text-lp-muted-dark mb-3">User prompt</p>
          <p className="text-sm md:text-base text-lp-white leading-relaxed font-medium">&ldquo;{PROMPT}&rdquo;</p>
          <div className="mt-6 h-1.5 rounded-full bg-lp-panel overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-lp-ice-blue to-lp-cold-blue"
              style={{ width: `${progress}%` }}
              transition={{ ease: "linear" }}
            />
          </div>
          <p className="mt-2 text-xs text-lp-muted">{STEPS[active].detail}</p>
        </motion.div>

        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const isActive = i === active;
            const isDone = i < active;
            return (
              <motion.div
                key={step.label}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-all ${
                  isActive
                    ? "border-lp-ice-blue/50 bg-lp-ice-blue/10 shadow-[0_0_24px_rgba(96,165,250,0.15)]"
                    : isDone
                      ? "border-lp-success/30 bg-lp-success/5"
                      : "border-lp-border bg-lp-panel"
                }`}
                animate={isActive ? { scale: [1, 1.01, 1] } : { scale: 1 }}
                transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? "bg-lp-success/20 text-lp-success"
                      : isActive
                        ? "bg-lp-ice-blue/20 text-lp-ice-blue"
                        : "bg-lp-panel-strong text-lp-muted-dark"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-lp-white">{step.label}</p>
                  {isActive && (
                    <motion.p
                      className="text-xs text-lp-muted mt-0.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      Processing…
                    </motion.p>
                  )}
                </div>
                {isActive && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-lp-cold-blue animate-pulse" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
