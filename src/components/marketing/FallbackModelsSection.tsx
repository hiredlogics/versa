"use client";

import { motion } from "framer-motion";
import { ArrowRight, RefreshCw } from "lucide-react";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const MODELS = [
  { name: "OpenAI", color: "border-lp-success/40 text-lp-success" },
  { name: "Groq", color: "border-lp-ice-blue/40 text-lp-ice-blue" },
  { name: "Gemini", color: "border-lp-cold-blue/40 text-lp-cold-blue" },
  { name: "Claude", color: "border-lp-ice-blue/40 text-lp-cold-blue" },
];

export function FallbackModelsSection() {
  return (
    <SectionShell soft id="reliability">
      <SectionHeader
        badge="Infrastructure"
        title="Built for reliable AI execution"
        subtitle="Fallback AI routing keeps lead scoring reliable even when one model fails."
      />

      <FadeIn>
        <div className="glass-panel-strong rounded-2xl border border-lp-border p-6 md:p-10">
          <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-2 flex-wrap">
            {MODELS.map((model, i) => (
              <div key={model.name} className="flex items-center gap-2 md:gap-3">
                <motion.div
                  className={`rounded-xl border bg-lp-black/80 px-5 py-3 text-sm font-semibold ${model.color}`}
                  whileHover={{ scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  {model.name}
                </motion.div>
                {i < MODELS.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-lp-muted-dark hidden md:block" />
                )}
              </div>
            ))}
            <RefreshCw className="w-5 h-5 text-lp-muted ml-0 md:ml-2 animate-spin-slow" />
          </div>

          <p className="mt-8 text-center text-sm text-lp-muted max-w-2xl mx-auto leading-relaxed">
            If one model rate-limits, times out, or returns invalid JSON, {BRAND.name} automatically retries with the next provider. Your searches keep running — no manual intervention.
          </p>

          <div className="mt-8 grid sm:grid-cols-3 gap-4 text-center">
            {[
              { stat: "4", label: "Model providers" },
              { stat: "Auto", label: "Failover routing" },
              { stat: "JSON", label: "Schema validation" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-lp-border bg-lp-panel py-4">
                <p className="text-2xl font-bold text-lp-white">{item.stat}</p>
                <p className="text-xs text-lp-muted mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>
    </SectionShell>
  );
}
