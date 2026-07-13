"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SAMPLE_LEADS } from "./constants";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";

export function AiScoringSection() {
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setHighlight((h) => (h + 1) % SAMPLE_LEADS.length), 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <SectionShell soft id="scoring">
      <SectionHeader
        badge="AI scoring engine"
        title="Ranked leads with explainable intelligence"
        subtitle="Every contact receives a fit score, priority tier, and signal summary — so your team knows who to reach first."
      />

      <div className="grid lg:grid-cols-5 gap-8 items-start">
        <FadeIn className="lg:col-span-2 space-y-4">
          {[
            { label: "Fit score", value: "1–10 scale", color: "text-lp-success" },
            { label: "Signal detection", value: "Hiring, funding, tech stack", color: "text-lp-cold-blue" },
            { label: "Outreach angle", value: "AI-generated talking points", color: "text-lp-cold-blue" },
            { label: "Priority tier", value: "High · Medium · Nurture", color: "text-lp-silver" },
          ].map((item) => (
            <div key={item.label} className="glass-panel rounded-xl border border-lp-border p-4">
              <p className="text-xs uppercase tracking-wider text-lp-muted-dark">{item.label}</p>
              <p className={`mt-1 text-sm font-medium ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </FadeIn>

        <FadeIn className="lg:col-span-3" delay={0.15}>
          <div className="overflow-hidden rounded-2xl border border-lp-border bg-lp-black/60">
            <div className="grid grid-cols-6 gap-2 border-b border-lp-border bg-lp-panel px-4 py-3 text-[10px] uppercase tracking-wider text-lp-muted-dark">
              <span className="col-span-2">Name</span>
              <span>Title</span>
              <span>Company</span>
              <span>Signal</span>
              <span className="text-right">Score</span>
            </div>
            {SAMPLE_LEADS.map((lead, i) => (
              <div
                key={lead.name}
                className={`relative grid grid-cols-6 gap-2 px-4 py-3 text-xs border-b border-lp-border/40 last:border-0 transition-colors ${
                  highlight === i ? "bg-lp-ice-blue/10" : ""
                }`}
              >
                {highlight === i && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-lp-cold-blue/5 via-lp-ice-blue/10 to-transparent pointer-events-none"
                    layoutId="score-scan"
                  />
                )}
                <span className="col-span-2 font-medium text-lp-white relative">{lead.name}</span>
                <span className="text-lp-muted relative truncate">{lead.title}</span>
                <span className="text-lp-muted relative truncate">{lead.company}</span>
                <span className="text-lp-cold-blue relative truncate">{lead.signal}</span>
                <span className="text-right font-bold text-lp-success relative">{lead.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-lp-muted-dark text-center">Priority column available in full product view</p>
        </FadeIn>
      </div>
    </SectionShell>
  );
}
