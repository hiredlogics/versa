"use client";

import { BRAND } from "@/config/brand";

const EXAMPLES = [
  ["Founders likely to need automation", "SaaS founders in the US, 20 to 300 employees"],
  ["Recently funded teams hiring sales", "VP of Sales at fintech companies that raised funding"],
  ["Agency owners in the UK", "Marketing agency founders in the UK, 10 to 50 employees"],
  ["People open to new roles", "Backend engineers in Germany open to work"],
] as const;

export function EmptyLeadState({ onSelect }: { onSelect?: (prompt: string) => void }) {
  return <div className="px-4 py-12"><p className="text-xs font-medium uppercase tracking-[0.18em] text-lp-cold-blue">Lead Finder</p><h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-lp-white sm:text-4xl">{BRAND.emptyStateHeadline}</h2><p className="mt-3 max-w-2xl text-sm text-lp-muted">Describe your ideal buyer in plain words, or start from a person or a company. We find matches, score them and keep the best.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{EXAMPLES.map(([title, prompt]) => <button key={title} type="button" onClick={() => onSelect?.(prompt)} className="rounded-xl border border-lp-border bg-lp-panel p-4 text-left transition-colors hover:border-lp-cold-blue/50 focus:outline-none focus:ring-2 focus:ring-lp-cold-blue"><p className="text-sm font-medium text-lp-white">{title}</p><p className="mt-1 text-xs text-lp-muted">{prompt}</p></button>)}</div></div>;
}
