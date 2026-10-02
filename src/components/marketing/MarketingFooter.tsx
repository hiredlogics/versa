"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/config/brand";

const FOOTER_LINKS = {
  Product: [
    { href: "/features", label: "Features" },
    { href: "/use-cases", label: "Use Cases" },
    { href: "/pricing", label: "Pricing" },
  ],
  Company: [
    { href: "/contact", label: "Contact" },
    { href: "/login", label: "Log in" },
    { href: "/register", label: "Sign up" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="border-t border-lp-border bg-lp-graphite">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <Logo size="lg" animated />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-lp-muted">
              AI lead intelligence for teams that need qualified buyers, not raw contact lists.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-lp-muted-dark">{group}</p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={`${group}-${link.label}`}>
                    <Link href={link.href} className="text-sm text-lp-muted transition-colors hover:text-lp-ice-blue">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col justify-between gap-4 border-t border-lp-border pt-8 text-xs text-lp-muted-dark sm:flex-row">
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <p>Verified data · Secure payments</p>
        </div>
      </div>
    </footer>
  );
}
