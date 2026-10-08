"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/marketing/ThemeToggle";
import { cn } from "@/lib/utils/cn";

/** "Log in / Start free" for visitors, "Open app" for someone already logged in. */
function AuthLinks({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { isSignedIn } = useAuth();
  const ctaClass = mobile ? "lp-btn-cta w-full text-center py-3.5 text-sm" : "lp-btn-cta text-sm";

  if (isSignedIn) {
    return (
      <Link href="/app" onClick={onNavigate} className={ctaClass}>
        Open app
      </Link>
    );
  }
  return (
    <>
      <Link
        href="/login"
        onClick={onNavigate}
        className={mobile ? "lp-nav-login text-center py-3 text-sm" : "lp-nav-login text-sm px-1"}
      >
        Log in
      </Link>
      <Link href="/register" onClick={onNavigate} className={ctaClass}>
        Start free
      </Link>
    </>
  );
}

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/use-cases", label: "Use Cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="lp-nav-enter fixed top-0 inset-x-0 z-50">
      <div className="lp-nav-glass absolute inset-0" aria-hidden />

      <div className="relative mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo size="lg" animated variant="nav" className="relative z-10 shrink-0" />

        <nav
          className="lp-nav-pill hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-0.5 p-1"
          aria-label="Main navigation"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative rounded-full px-4 py-2 text-[13px] font-medium tracking-wide transition-colors duration-300",
                  active ? "text-lp-white" : "lp-nav-link text-lp-muted hover:text-lp-white"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full lp-nav-link-active"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          <ThemeToggle />
          <AuthLinks />
        </div>

        <div className="flex md:hidden items-center gap-2 relative z-10">
          <ThemeToggle />
          <button
            type="button"
            className="lp-nav-menu-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden relative overflow-hidden border-t lp-nav-mobile-divider"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="lp-nav-mobile-panel px-4 py-5 sm:px-6">
              <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
                {NAV_LINKS.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-xl px-4 py-3.5 text-[15px] font-medium",
                        active ? "lp-nav-mobile-link-active" : "lp-nav-mobile-link"
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-4 flex flex-col gap-2.5 border-t lp-nav-mobile-divider pt-4">
                <AuthLinks mobile onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
