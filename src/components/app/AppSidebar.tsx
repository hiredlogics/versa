"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Search, History, Users, Settings, CreditCard, Gauge, Shield, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAppShellData } from "@/components/app/AppShellDataProvider";
import { cn } from "@/lib/utils/cn";
import { BRAND } from "@/config/brand";
import { ThemeToggle } from "@/components/marketing/ThemeToggle";

const nav = [
  { href: "/app", label: "Lead Finder", icon: Search, exact: true },
  { href: "/app/searches", label: "Searches", icon: History },
  { href: "/app/leads", label: "All Leads", icon: Users },
  { href: "/app/usage", label: "Plan & Usage", icon: Gauge },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const shellData = useAppShellData();
  const isAdmin = shellData?.platformStatus.isAdmin ?? false;
  const links = isAdmin
    ? [...nav, { href: "/admin", label: "Admin Console", icon: Shield, exact: false }]
    : nav;

  return (
    <nav className="flex-1 space-y-1 p-3">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active =
          exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
              active
                ? "app-nav-active"
                : "border border-transparent text-lp-muted hover:bg-lp-panel hover:text-lp-off-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const sidebar = (
    <aside className="flex h-full w-60 flex-col border-r border-lp-border bg-lp-graphite">
      <div className="border-b border-lp-border p-4">
        <Logo size="lg" animated variant="nav" href="/" showText className="origin-left" />
        <p className="mt-2 text-[11px] text-lp-muted-dark">{BRAND.tagline}</p>
      </div>
      <NavLinks onNavigate={onMobileClose} />
      <div className="border-t border-lp-border p-4">
        <div className="flex items-center gap-3">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-lp-off-white">Account</p>
            <p className="truncate text-[11px] text-lp-muted-dark">Manage profile</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:flex md:shrink-0">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button
              type="button"
              onClick={onMobileClose}
              className="absolute right-3 top-3 z-10 rounded-lg border border-lp-border bg-lp-panel p-2 text-lp-muted hover:text-lp-white"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
