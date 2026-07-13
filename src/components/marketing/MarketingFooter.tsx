"use client";

import Link from "next/link";
import { useState } from "react";
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
    { href: "/contact", label: "Privacy" },
    { href: "/contact", label: "Terms" },
  ],
};

export function MarketingFooter() {
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterDone, setNewsletterDone] = useState(false);

  function handleNewsletter(e: React.FormEvent) {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setNewsletterDone(true);
    setNewsletterEmail("");
  }

  return (
    <footer className="border-t border-lp-border bg-lp-graphite">
      {/* Newsletter strip — visual-only capture (no backend in v1) */}
      <div className="border-b border-lp-border px-4 py-10">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-lp-white">Stay ahead on AI lead intelligence</p>
            <p className="mt-1 text-xs text-lp-muted">Product updates and GTM insights. No spam.</p>
          </div>
          {newsletterDone ? (
            <p className="text-sm text-lp-success">You&apos;re on the list. (Preview — not yet connected.)</p>
          ) : (
            <form onSubmit={handleNewsletter} className="flex w-full max-w-md gap-2">
              <input
                type="email"
                placeholder="Work email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="lp-input flex-1 rounded-lg border border-lp-border bg-lp-panel px-4 py-2.5 text-sm text-lp-white placeholder:text-lp-muted-dark focus:outline-none focus:border-lp-ice-blue/50"
              />
              <button type="submit" className="lp-btn-primary shrink-0 px-5 py-2.5 text-sm">
                Subscribe
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid md:grid-cols-5 gap-10">
          <div className="md:col-span-2">
            <Logo size="lg" animated />
            <p className="mt-4 text-sm text-lp-muted max-w-sm leading-relaxed">
              AI lead intelligence for teams that need qualified buyers, not raw contact lists.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-lp-muted-dark mb-4">{group}</p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={`${group}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-lp-muted transition-colors hover:text-lp-ice-blue"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-8 border-t border-lp-border flex flex-col sm:flex-row justify-between gap-4 text-xs text-lp-muted-dark">
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <p>Apollo enrichment · Multi-model AI · Stripe billing</p>
        </div>
      </div>
    </footer>
  );
}
