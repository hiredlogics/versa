import { GlassCard } from "@/components/ui/Card";
import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "Use cases",
  description: "Lead discovery workflows for growing teams.",
  openGraph: {
    title: `${BRAND.name} Use cases`,
    description: "Lead discovery workflows for growing teams.",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

const cases = [
  { title: "SaaS sales teams", desc: "Find CTOs and founders at midsize software companies." },
  { title: "AI consultancies", desc: "Target ops leaders interested in automation and AI solutions." },
  { title: "Agencies", desc: "Build prospect lists for outbound campaigns at scale." },
  { title: "Recruiters", desc: "Find professionals by role, location, and company size." },
];

export default function UseCasesPage() {
  return (
    <div className="pt-24 pb-24 px-4 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-center mb-12">Use cases</h1>
      <div className="grid md:grid-cols-2 gap-6">
        {cases.map((c) => (
          <GlassCard key={c.title}>
            <h2 className="font-semibold text-off-white">{c.title}</h2>
            <p className="text-sm text-muted mt-2">{c.desc}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
