"use client";

import { Search } from "lucide-react";
import { BRAND } from "@/config/brand";

export function EmptyLeadState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-lp-border bg-lp-panel">
        <Search className="h-6 w-6 text-lp-cold-blue" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-lp-white sm:text-3xl">
        {BRAND.emptyStateHeadline}
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-lp-muted">
        Describe your ideal customer, paste a LinkedIn profile, or enter a company URL. {BRAND.name}{" "}
        will parse your intent, find matching people, score leads, and save the best matches.
      </p>
    </div>
  );
}
