"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CreditCard,
  Key,
  Layers,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Search,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/searches", label: "Searches", icon: Search },
  { href: "/admin/leads", label: "Leads", icon: UserCheck },
  { href: "/admin/plans", label: "Plans", icon: Layers },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/admin/api-health", label: "API Health", icon: Activity },
  { href: "/admin/api-keys", label: "API Keys", icon: Key },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

export function AdminShell({
  children,
  adminEmail,
}: {
  children: React.ReactNode;
  adminEmail: string;
}) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="flex min-h-screen bg-charcoal">
      <aside className="flex w-56 shrink-0 flex-col border-r border-glass-border bg-charcoal-light">
        <div className="border-b border-glass-border p-4">
          <div className="flex items-center gap-2 text-off-white">
            <Shield className="h-4 w-4 text-electric" />
            <span className="text-sm font-semibold">Admin Console</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Platform management</p>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {links.map(({ href, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-electric/15 text-electric"
                    : "text-muted hover:bg-white/5 hover:text-off-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-glass-border p-3 space-y-1">
          <p className="truncate px-3 py-1 text-[11px] text-muted">{adminEmail}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-off-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-off-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
