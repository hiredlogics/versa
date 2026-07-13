"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export function SignalCard({
  label,
  value,
  accent = "blue",
  className,
  delay = 0,
}: {
  label: string;
  value: string;
  accent?: "blue" | "violet" | "cyan" | "emerald" | "amber";
  className?: string;
  delay?: number;
}) {
  const accentMap = {
    blue: "border-lp-ice-blue/35 text-lp-ice-blue shadow-lp-ice-blue/10",
    violet: "border-lp-cold-blue/35 text-lp-cold-blue shadow-lp-cold-blue/10",
    cyan: "border-lp-cold-blue/35 text-lp-cold-blue shadow-lp-cold-blue/10",
    emerald: "border-lp-success/35 text-lp-success shadow-lp-success/10",
    amber: "border-lp-silver/35 text-lp-silver shadow-lp-silver/10",
  };

  return (
    <motion.div
      className={cn(
        "lp-glass-panel rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md",
        accentMap[accent],
        className
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: [0, -6, 0] }}
      transition={{
        opacity: { duration: 0.5, delay },
        y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: delay + 0.5 },
      }}
    >
      <p className="text-[10px] uppercase tracking-wider text-lp-muted-dark">{label}</p>
      <p className="text-sm font-semibold text-lp-white">{value}</p>
    </motion.div>
  );
}
