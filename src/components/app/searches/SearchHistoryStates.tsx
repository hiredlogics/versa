"use client";

import { motion } from "framer-motion";
import { BRAND } from "@/config/brand";

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-lp-panel-strong ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent, rgba(187,215,255,0.06), transparent)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.8s infinite",
      }}
    />
  );
}

export function SearchHistorySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="app-panel rounded-3xl p-5 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <SkeletonBar className="h-4 w-3/4 max-w-md" />
            <SkeletonBar className="h-6 w-20 rounded-full" />
          </div>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <SkeletonBar className="h-10" />
            <SkeletonBar className="h-10" />
            <SkeletonBar className="h-10" />
          </div>
          <SkeletonBar className="mb-4 h-6 w-full max-w-lg" />
          <div className="space-y-2">
            <SkeletonBar className="h-12" />
            <SkeletonBar className="h-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchHistoryEmpty() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="app-panel mx-auto flex max-w-lg flex-col items-center rounded-3xl px-8 py-14 text-center"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-lp-border bg-lp-panel-strong">
        <span className="text-2xl text-lp-ice-blue">⌕</span>
      </div>
      <h2 className="text-lg font-semibold text-lp-white">No searches yet.</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-lp-muted">
        Start with one prompt. {BRAND.name} will save every search, filter set, and qualified lead
        list here.
      </p>
      <a
        href="/app"
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-lp-white px-5 py-2.5 text-sm font-medium text-lp-black transition-opacity hover:opacity-90"
      >
        Find leads
      </a>
    </motion.div>
  );
}

export function SearchHistoryError({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="app-panel mx-auto flex max-w-lg flex-col items-center rounded-3xl px-8 py-14 text-center"
    >
      <h2 className="text-lg font-semibold text-lp-white">Couldn&apos;t load search history.</h2>
      <p className="mt-2 text-sm text-lp-muted">
        Refresh the page or try again in a moment.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center justify-center rounded-xl border border-lp-border bg-lp-panel px-5 py-2.5 text-sm font-medium text-lp-off-white transition-colors hover:border-lp-border-strong hover:bg-lp-panel-strong"
      >
        Retry
      </button>
    </motion.div>
  );
}
