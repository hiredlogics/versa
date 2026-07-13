"use client";

import { ContextTagInput } from "./ContextTagInput";
import { CompanySizeRange } from "./CompanySizeRange";
import {
  EXCLUDED_TITLE_SUGGESTIONS,
  INDUSTRY_SUGGESTIONS,
  TITLE_SUGGESTIONS,
  type OnboardingFormState,
} from "./types";

export function IdealCustomerStep({
  data,
  onChange,
}: {
  data: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-lp-white">Ideal customer profile</h2>
        <p className="mt-1 text-sm text-lp-muted">Define who you want to reach on Apollo.</p>
      </div>
      <ContextTagInput
        label="Target industries *"
        values={data.targetIndustries}
        onChange={(targetIndustries) => onChange({ targetIndustries })}
        suggestions={INDUSTRY_SUGGESTIONS}
      />
      <ContextTagInput
        label="Target countries / regions *"
        values={data.targetCountries}
        onChange={(targetCountries) => onChange({ targetCountries })}
        suggestions={["United States", "Canada", "United Kingdom", "Australia", "Germany"]}
      />
      <CompanySizeRange
        min={data.companySizeMin}
        max={data.companySizeMax}
        onChange={(companySizeMin, companySizeMax) => onChange({ companySizeMin, companySizeMax })}
      />
      <ContextTagInput
        label="Target job titles *"
        values={data.targetTitles}
        onChange={(targetTitles) => onChange({ targetTitles })}
        suggestions={TITLE_SUGGESTIONS}
      />
      <ContextTagInput
        label="Target seniority (optional)"
        values={data.targetSeniorities}
        onChange={(targetSeniorities) => onChange({ targetSeniorities })}
        suggestions={["Executive", "VP", "Director", "Manager"]}
      />
      <ContextTagInput
        label="Excluded titles"
        values={data.excludedTitles}
        onChange={(excludedTitles) => onChange({ excludedTitles })}
        suggestions={EXCLUDED_TITLE_SUGGESTIONS}
      />
      <ContextTagInput
        label="Excluded industries"
        values={data.excludedIndustries}
        onChange={(excludedIndustries) => onChange({ excludedIndustries })}
      />
    </div>
  );
}
