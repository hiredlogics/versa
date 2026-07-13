"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { BusinessContextStep } from "@/components/onboarding/BusinessContextStep";
import { IdealCustomerStep } from "@/components/onboarding/IdealCustomerStep";
import { QualificationStep } from "@/components/onboarding/QualificationStep";
import { ReviewContextStep } from "@/components/onboarding/ReviewContextStep";
import { defaultOnboardingState, type OnboardingFormState } from "@/components/onboarding/types";

export function OnboardingPageClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingFormState>(defaultOnboardingState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function patch(p: Partial<OnboardingFormState>) {
    setData((d) => ({ ...d, ...p }));
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!data.businessDescription.trim() || data.businessDescription.trim().length < 10) {
        return "Describe what your company sells (at least 10 characters).";
      }
    }
    if (step === 1) {
      if (!data.targetIndustries.length) return "Add at least one target industry.";
      if (!data.targetCountries.length) return "Add at least one target country.";
      if (!data.targetTitles.length) return "Add at least one target job title.";
      if (data.companySizeMin >= data.companySizeMax) {
        return "Company size minimum must be less than maximum.";
      }
    }
    if (step === 2) {
      if (!data.servicesToSell.length) return "Add at least one service you sell.";
    }
    return null;
  }

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      router.push("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (step < 3) setStep((s) => s + 1);
    else save();
  }

  return (
    <OnboardingShell step={step}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && <BusinessContextStep data={data} onChange={patch} />}
          {step === 1 && <IdealCustomerStep data={data} onChange={patch} />}
          {step === 2 && <QualificationStep data={data} onChange={patch} />}
          {step === 3 && <ReviewContextStep data={data} />}
        </motion.div>
      </AnimatePresence>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-8 flex justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => (step > 0 ? setStep((s) => s - 1) : undefined)}
          disabled={step === 0 || loading}
        >
          Back
        </Button>
        <Button onClick={next} disabled={loading}>
          {loading ? "Saving…" : step === 3 ? "Save and start finding leads" : "Continue"}
        </Button>
      </div>
    </OnboardingShell>
  );
}
