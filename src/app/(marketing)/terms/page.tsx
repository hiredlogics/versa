import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms", description: "Terms for using Varsā." };

// TODO: legal review
export default function TermsPage() {
  return <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 text-lp-muted"><h1 className="text-4xl font-bold text-lp-white">Terms</h1><p className="mt-4 text-sm">Last updated: October 2, 2026</p>{["Data we collect", "How we use it", "Retention", "Your rights", "Contact"].map((title) => <section key={title} className="mt-10"><h2 className="text-xl font-semibold text-lp-white">{title}</h2><p className="mt-2">Placeholder — this section will be completed following legal review.</p></section>)}</main>;
}
