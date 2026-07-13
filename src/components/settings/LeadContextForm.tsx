"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IdealCustomerStep } from "@/components/onboarding/IdealCustomerStep";
import { QualificationStep } from "@/components/onboarding/QualificationStep";
import { BusinessContextStep } from "@/components/onboarding/BusinessContextStep";
import { defaultOnboardingState, type OnboardingFormState } from "@/components/onboarding/types";
import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

function dtoToForm(ctx: UserLeadContextDTO): OnboardingFormState {
  return {
    companyName: ctx.companyName ?? "",
    websiteUrl: ctx.websiteUrl ?? "",
    businessDescription: ctx.businessDescription ?? "",
    targetMarket: ctx.targetMarket ?? "",
    mainOffer: ctx.mainOffer ?? "",
    targetIndustries: ctx.targetIndustries,
    targetCountries: ctx.targetCountries,
    companySizeMin: ctx.companySizeMin ?? 20,
    companySizeMax: ctx.companySizeMax ?? 500,
    targetTitles: ctx.targetTitles,
    targetSeniorities: ctx.targetSeniorities,
    excludedIndustries: ctx.excludedIndustries,
    excludedTitles: ctx.excludedTitles,
    preferredBuyingSignals: ctx.preferredBuyingSignals,
    highQualityLeadNotes: ctx.highQualityLeadNotes ?? "",
    badLeadNotes: ctx.badLeadNotes ?? "",
    preferredOutreachAngle: ctx.preferredOutreachAngle ?? "",
    servicesToSell: ctx.servicesToSell,
    minLeadScore: ctx.minLeadScore,
  };
}

export function LeadContextForm({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<OnboardingFormState>(defaultOnboardingState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/context")
      .then((r) => r.json())
      .then((d) => {
        if (d.context) setData(dtoToForm(d.context));
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/onboarding/context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setMessage("Lead context saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className={embedded ? "h-32 animate-pulse rounded-xl bg-lp-panel/50" : "h-32 animate-pulse rounded-xl bg-lp-panel"} />;
  }

  const content = (
    <>
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-lp-white">Lead context & ICP</h2>
          <p className="mt-1 text-sm text-lp-muted">
            Update your business profile. Vague lead searches use this automatically.
          </p>
        </div>
      )}
      <BusinessContextStep data={data} onChange={(p) => setData((d) => ({ ...d, ...p }))} />
      <IdealCustomerStep data={data} onChange={(p) => setData((d) => ({ ...d, ...p }))} />
      <QualificationStep data={data} onChange={(p) => setData((d) => ({ ...d, ...p }))} />
      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
          {message}
        </p>
      )}
      <div className="flex justify-end border-t border-lp-border pt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save context"}
        </Button>
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-8">{content}</div>;
  }

  return (
    <div className="app-panel space-y-8 rounded-xl p-6">
      {content}
    </div>
  );
}
