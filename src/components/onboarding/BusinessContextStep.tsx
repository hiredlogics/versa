"use client";

import type { OnboardingFormState } from "./types";

export function BusinessContextStep({
  data,
  onChange,
}: {
  data: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-lp-white">Business context</h2>
        <p className="mt-1 text-sm text-lp-muted">What does your company sell and who do you help?</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Company name</span>
        <input
          className="app-input"
          value={data.companyName}
          onChange={(e) => onChange({ companyName: e.target.value })}
          placeholder="Acme Inc."
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Website URL</span>
        <input
          className="app-input"
          value={data.websiteUrl}
          onChange={(e) => onChange({ websiteUrl: e.target.value })}
          placeholder="https://example.com"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">What does your company sell? *</span>
        <textarea
          rows={3}
          className="app-input resize-none"
          value={data.businessDescription}
          onChange={(e) => onChange({ businessDescription: e.target.value })}
          placeholder="We sell AI automation and custom software for mid-market SaaS companies..."
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Who do you usually sell to?</span>
        <input
          className="app-input"
          value={data.targetMarket}
          onChange={(e) => onChange({ targetMarket: e.target.value })}
          placeholder="B2B SaaS founders and ops leaders"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Main offer / service</span>
        <input
          className="app-input"
          value={data.mainOffer}
          onChange={(e) => onChange({ mainOffer: e.target.value })}
          placeholder="Done-for-you workflow automation"
        />
      </label>
    </div>
  );
}
