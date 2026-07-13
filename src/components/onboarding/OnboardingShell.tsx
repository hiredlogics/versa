"use client";

import { BRAND } from "@/config/brand";
import { Logo } from "@/components/brand/Logo";
import { VersaBackground } from "@/components/brand/VersaBackground";
import { OnboardingProgress } from "./OnboardingProgress";

export function OnboardingShell({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] bg-lp-black">
      <VersaBackground fixed={false} variant="subtle" />
      <div className="relative mx-auto max-w-2xl px-4 py-10 md:py-14">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo href="/onboarding" size="lg" animated className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight text-lp-white md:text-3xl">
            {BRAND.onboardingHeadline}
          </h1>
          <p className="mt-2 max-w-md text-sm text-lp-muted">{BRAND.onboardingSubheadline}</p>
        </div>
        <OnboardingProgress step={step} />
        <div className="app-panel rounded-2xl p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
}
