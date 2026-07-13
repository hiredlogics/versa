import { Globe, Mail, Building2, Zap } from "lucide-react";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const CAPABILITIES = [
  { icon: Mail, title: "Verified emails", desc: "Reach decision-makers with enriched contact data from Apollo." },
  { icon: Building2, title: "Firmographics", desc: "Company size, industry, location, and growth signals in one view." },
  { icon: Globe, title: "Smart filter relax", desc: "Progressive query expansion when strict filters return thin results." },
  { icon: Zap, title: "Real-time enrichment", desc: "Fresh data on every search — no stale static lists." },
];

export function ApolloEnrichmentSection() {
  return (
    <SectionShell id="apollo">
      <SectionHeader
        badge="Apollo enrichment"
        title="Apollo enrichment meets AI qualification"
        subtitle={`${BRAND.name} connects to Apollo's B2B database and layers AI reasoning on top — so you get depth and discernment in one workflow.`}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CAPABILITIES.map((cap, i) => (
          <FadeIn key={cap.title} delay={i * 0.08}>
            <div className="h-full rounded-2xl border border-lp-border bg-gradient-to-b from-lp-panel to-transparent p-6 card-glow">
              <cap.icon className="w-7 h-7 text-lp-ice-blue mb-4" />
              <h3 className="font-semibold text-lp-white">{cap.title}</h3>
              <p className="mt-2 text-sm text-lp-muted leading-relaxed">{cap.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
