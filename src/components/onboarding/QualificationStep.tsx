"use client";

import { ContextTagInput } from "./ContextTagInput";
import { BUYING_SIGNAL_SUGGESTIONS, SERVICE_SUGGESTIONS, type OnboardingFormState } from "./types";

export function QualificationStep({
  data,
  onChange,
}: {
  data: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-lp-white">Lead qualification</h2>
        <p className="mt-1 text-sm text-lp-muted">How should AI score and prioritize leads for you?</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Minimum lead score (1–10)</span>
        <input
          type="number"
          min={1}
          max={10}
          className="app-input w-24"
          value={data.minLeadScore}
          onChange={(e) => onChange({ minLeadScore: Number(e.target.value) || 8 })}
        />
      </label>
      <ContextTagInput
        label="Services you sell *"
        values={data.servicesToSell}
        onChange={(servicesToSell) => onChange({ servicesToSell })}
        suggestions={SERVICE_SUGGESTIONS}
      />
      <ContextTagInput
        label="Buying signals to prioritize"
        values={data.preferredBuyingSignals}
        onChange={(preferredBuyingSignals) => onChange({ preferredBuyingSignals })}
        suggestions={BUYING_SIGNAL_SUGGESTIONS}
      />
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">What makes a lead high-quality?</span>
        <textarea
          rows={2}
          className="app-input resize-none"
          value={data.highQualityLeadNotes}
          onChange={(e) => onChange({ highQualityLeadNotes: e.target.value })}
          placeholder="Decision-maker, right company size, clear automation need..."
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">What makes a lead bad?</span>
        <textarea
          rows={2}
          className="app-input resize-none"
          value={data.badLeadNotes}
          onChange={(e) => onChange({ badLeadNotes: e.target.value })}
          placeholder="Too small, wrong industry, junior IC roles..."
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Preferred outreach angle</span>
        <input
          className="app-input"
          value={data.preferredOutreachAngle}
          onChange={(e) => onChange({ preferredOutreachAngle: e.target.value })}
          placeholder="Lead with ROI from automation case studies"
        />
      </label>
    </div>
  );
}
