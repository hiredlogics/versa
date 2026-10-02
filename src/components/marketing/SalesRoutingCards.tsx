"use client";

import { motion } from "framer-motion";
import { FadeIn } from "./AnimatedAurora";

const CARDS = [
  {
    title: "For founders",
    desc: "Test who buys and find your first customers.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3L3 9v12h18V9L12 3z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 21V12h6v9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "For agencies",
    desc: "Build qualified client lists for outbound campaigns.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "For GTM teams",
    desc: "Turn buyer criteria into scored pipeline.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18" strokeLinecap="round" />
        <path d="M7 14l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function SalesRoutingCards() {
  return (
    <section className="py-16 md:py-20 px-4">
      <div className="mx-auto max-w-6xl grid md:grid-cols-3 gap-5">
        {CARDS.map((card, i) => (
          <FadeIn key={card.title} delay={i * 0.08}>
            <motion.div
              className="lp-card-hover h-full rounded-2xl border border-lp-border bg-lp-panel p-6"
              whileHover={{ y: -4 }}
              transition={{ duration: 0.25 }}
            >
              <div className="mb-4 inline-flex rounded-lg border border-lp-border bg-lp-graphite p-2.5 text-lp-ice-blue">
                {card.icon}
              </div>
              <h3 className="text-lg font-semibold text-lp-white">{card.title}</h3>
              <p className="mt-2 text-sm text-lp-muted leading-relaxed">{card.desc}</p>
            </motion.div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
