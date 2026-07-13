"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AdvancedFilters } from "@/lib/types/lead-finder";

interface AdvancedFiltersDrawerProps {
  open: boolean;
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
  onClose: () => void;
  onApply: () => void;
}

export function AdvancedFiltersDrawer({
  open,
  filters,
  onChange,
  onClose,
  onApply,
}: AdvancedFiltersDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close filters"
      />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-lp-border bg-lp-graphite shadow-2xl">
        <div className="flex items-center justify-between border-b border-lp-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-lp-white">Advanced filters</h2>
            <p className="text-xs text-lp-muted-dark">Refine your search criteria</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lp-border p-2 text-lp-muted hover:text-lp-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Industry">
            <input
              className="app-input"
              value={filters.industry ?? ""}
              onChange={(e) => onChange({ ...filters, industry: e.target.value })}
              placeholder="e.g. SaaS, Healthcare"
            />
          </Field>
          <Field label="Country">
            <input
              className="app-input"
              value={filters.country ?? ""}
              onChange={(e) => onChange({ ...filters, country: e.target.value })}
              placeholder="e.g. United States"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min employees">
              <input
                type="number"
                className="app-input"
                value={filters.companySizeMin ?? ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    companySizeMin: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="10"
              />
            </Field>
            <Field label="Max employees">
              <input
                type="number"
                className="app-input"
                value={filters.companySizeMax ?? ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    companySizeMax: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="500"
              />
            </Field>
          </div>
          <Field label="Job titles">
            <input
              className="app-input"
              value={filters.jobTitles ?? ""}
              onChange={(e) => onChange({ ...filters, jobTitles: e.target.value })}
              placeholder="Founder, CEO, CTO"
            />
          </Field>
          <Field label="Seniority">
            <input
              className="app-input"
              value={filters.seniority ?? ""}
              onChange={(e) => onChange({ ...filters, seniority: e.target.value })}
              placeholder="Executive, VP, Director"
            />
          </Field>
          <Field label="Minimum score (1–10)">
            <input
              type="number"
              min={1}
              max={10}
              className="app-input"
              value={filters.minScore ?? 8}
              onChange={(e) =>
                onChange({ ...filters, minScore: Number(e.target.value) || 8 })
              }
            />
          </Field>
        </div>

        <div className="flex gap-2 border-t border-lp-border p-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onApply}>
            Apply filters
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-lp-muted">{label}</span>
      {children}
    </label>
  );
}
