import { AlertTriangle, Clock, Database } from "lucide-react";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const PROBLEMS = [
  {
    icon: Clock,
    title: "Hours lost to manual prospecting",
    desc: "Your team scrolls LinkedIn and spreadsheets instead of talking to buyers.",
  },
  {
    icon: Database,
    title: "Raw lists without qualification",
    desc: "Bulk databases dump contacts — not intent, fit, or outreach angles.",
  },
  {
    icon: AlertTriangle,
    title: "Stale data, weak signals",
    desc: "Outdated titles and missing emails mean bounced outreach and wasted pipeline.",
  },
];

export function ProblemSection() {
  return (
    <SectionShell>
      <SectionHeader
        badge="The problem"
        title="Skip raw databases. Get ranked buyers."
        subtitle={`Most outbound teams drown in unqualified contacts. ${BRAND.name} replaces guesswork with signal-driven lead intelligence.`}
      />
      <div className="grid md:grid-cols-3 gap-5">
        {PROBLEMS.map((item, i) => (
          <FadeIn key={item.title} delay={i * 0.1}>
            <div className="glass-panel card-glow h-full rounded-2xl border border-lp-border p-6">
              <item.icon className="w-8 h-8 text-lp-ice-blue mb-4" />
              <h3 className="text-lg font-semibold text-lp-white">{item.title}</h3>
              <p className="mt-2 text-sm text-lp-muted leading-relaxed">{item.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
