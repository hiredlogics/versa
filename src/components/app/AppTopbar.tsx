"use client";

import { Menu, Plus } from "lucide-react";
import { PlanBadge, UsageBadge } from "@/components/app/UsageBadge";
import { Button } from "@/components/ui/Button";

export function AppTopbar({
  title = "Lead Finder",
  subtitle = "Workspace",
  onMenuClick,
  onNewSearch,
  showNewSearch = true,
}: {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
  onNewSearch?: () => void;
  showNewSearch?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-lp-border bg-lp-black/80 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg border border-lp-border bg-lp-panel p-2 text-lp-muted transition-colors hover:text-lp-white md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-lp-white">{title}</h1>
          <p className="hidden text-[11px] text-lp-muted-dark sm:block">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <PlanBadge />
        </div>
        <UsageBadge compact />
        {showNewSearch && onNewSearch && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onNewSearch}
            className="hidden gap-1.5 sm:inline-flex"
          >
            <Plus className="h-3.5 w-3.5" />
            New search
          </Button>
        )}
      </div>
    </header>
  );
}
