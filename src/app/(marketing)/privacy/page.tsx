import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${BRAND.name} handles personal information.`,
  openGraph: {
    title: `${BRAND.name} Privacy`,
    description: `How ${BRAND.name} handles personal information.`,
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

const SECTIONS = ["Data we collect", "How we use it", "Retention", "Your rights", "Contact"];

// TODO: legal review: every section below is placeholder copy.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-28 text-lp-muted">
      <h1 className="text-4xl font-bold text-lp-white">Privacy</h1>
      <p className="mt-4 text-sm">Last updated: October 2, 2026</p>
      {SECTIONS.map((title) => (
        <section key={title} className="mt-10">
          <h2 className="text-xl font-semibold text-lp-white">{title}</h2>
          <p className="mt-2">This section will be completed after legal review.</p>
        </section>
      ))}
    </div>
  );
}
