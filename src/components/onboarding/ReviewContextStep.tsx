"use client";

import type { OnboardingFormState } from "./types";

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="border-b border-lp-border/60 py-3 last:border-0">
      <p className="text-[11px] uppercase tracking-wider text-lp-muted-dark">{label}</p>
      <p className="mt-1 text-sm text-lp-off-white">{value}</p>
    </div>
  );
}

export function ReviewContextStep({ data }: { data: OnboardingFormState }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-lp-white">Review your profile</h2>
        <p className="mt-1 text-sm text-lp-muted">
          This context powers vague prompts like &quot;find me good SaaS leads.&quot;
        </p>
      </div>
      <div className="rounded-xl border border-lp-border bg-lp-panel/50 p-4">
        <Row label="Business" value={data.businessDescription} />
        <Row label="Industries" value={data.targetIndustries.join(", ")} />
        <Row label="Countries" value={data.targetCountries.join(", ")} />
        <Row
          label="Company size"
          value={`${data.companySizeMin} to ${data.companySizeMax} employees`}
        />
        <Row label="Titles" value={data.targetTitles.join(", ")} />
        <Row label="Services" value={data.servicesToSell.join(", ")} />
        <Row label="Excluded titles" value={data.excludedTitles.join(", ")} />
        <Row label="Min score" value={String(data.minLeadScore)} />
      </div>
    </div>
  );
}
