"use client";

import { UserProfile } from "@clerk/nextjs";
import { Shield, Target, UserCircle } from "lucide-react";
import { SettingsSectionCard } from "@/components/app/settings/SettingsSectionCard";
import { LeadContextForm } from "@/components/settings/LeadContextForm";
import { SignOutSection } from "@/components/settings/SignOutSection";
import { BRAND } from "@/config/brand";

export default function SettingsPage() {
  return (
    <div className="min-h-full">
      <header className="relative overflow-hidden border-b border-lp-border">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(127,179,255,0.12),transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-4xl px-6 py-10 md:px-8 md:py-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-lp-muted-dark">
            Workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-lp-white md:text-3xl">Settings</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-lp-muted md:text-[15px]">
            Shape how {BRAND.name} interprets your ideal buyers, keeps your profile in sync across searches,
            and secures your account.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8 md:px-8 md:py-10">
        <SettingsSectionCard
          id="lead-context"
          icon={Target}
          title="Lead context & ICP"
          description="Your business profile powers vague prompts, scoring, and exclusions. Update it anytime. Changes apply to the next search."
        >
          <LeadContextForm embedded />
        </SettingsSectionCard>

        <SettingsSectionCard
          icon={UserCircle}
          title="Account"
          description="Manage your login, profile, and security preferences."
        >
          <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-black/40">
            <UserProfile routing="hash" />
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          icon={Shield}
          title="Session"
          description="Sign out on this device when you are done or switching accounts."
        >
          <SignOutSection embedded />
        </SettingsSectionCard>
      </div>
    </div>
  );
}
