"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopbar } from "@/components/app/AppTopbar";

export function AppShell({
  children,
  topbarTitle,
  topbarSubtitle = "Workspace",
  onNewSearch,
  showNewSearch,
}: {
  children: React.ReactNode;
  topbarTitle?: string;
  topbarSubtitle?: string;
  onNewSearch?: () => void;
  showNewSearch?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell-bg flex h-[100dvh] overflow-hidden">
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          title={topbarTitle}
          subtitle={topbarSubtitle}
          onMenuClick={() => setMobileOpen(true)}
          onNewSearch={onNewSearch}
          showNewSearch={showNewSearch}
        />
        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
