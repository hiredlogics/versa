import { GlassCard } from "@/components/ui/Card";

const cases = [
  { title: "SaaS sales teams", desc: "Find CTOs and founders at mid-market software companies." },
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
