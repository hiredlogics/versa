"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";

const PAGE_TITLES: Record<string, string> = {
  "/app": "Lead Finder",
  "/app/searches": "Search history",
  "/app/leads": "All Leads",
  "/app/billing": "Billing",
  "/app/settings": "Settings",
};

const PAGE_SUBTITLES: Record<string, string> = {
  "/app": "Workspace",
  "/app/searches": "Past searches",
  "/app/leads": "Saved leads",
  "/app/billing": "Plan & usage",
  "/app/settings": "Account & context",
};

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname());
  const isLeadFinder = pathname === "/app";
  const isSearchHistory = pathname === "/app/searches" || pathname.startsWith("/app/searches/");
  const title = PAGE_TITLES[pathname] ?? (isSearchHistory ? "Search history" : "Workspace");
  const subtitle = PAGE_SUBTITLES[pathname] ?? "Workspace";

  return (
    <AppShell
      topbarTitle={title}
      topbarSubtitle={subtitle}
      showNewSearch={isLeadFinder || pathname === "/app/searches"}
      onNewSearch={
        isLeadFinder
          ? () => window.dispatchEvent(new Event("leadfinder:new-search"))
          : pathname === "/app/searches"
            ? () => {
                window.location.href = "/app";
              }
            : undefined
      }
    >
      {children}
    </AppShell>
  );
}
