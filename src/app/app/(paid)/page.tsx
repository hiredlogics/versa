"use client";

import dynamic from "next/dynamic";

const LeadFinderChat = dynamic(
  () => import("@/components/app/LeadFinderChat").then((mod) => mod.LeadFinderChat),
  {
    loading: () => (
      <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center">
        <p className="text-sm text-lp-muted">Loading Lead Finder…</p>
      </div>
    ),
  }
);

export default function AppDashboardPage() {
  return <LeadFinderChat />;
}
