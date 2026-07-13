import { Download, Shield, Sparkles, Zap } from "lucide-react";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";

const FEATURES = [
  { icon: Sparkles, title: "Prompt to filters", desc: "Natural language becomes Apollo-ready search criteria instantly." },
  { icon: Zap, title: "AI scoring", desc: "Every lead ranked 1–10 with reasoning and outreach angles." },
  { icon: Shield, title: "Enterprise-ready", desc: "Secure, multi-tenant, usage limits, and admin controls." },
  { icon: Download, title: "Export anywhere", desc: "CSV and Excel exports for your CRM workflow." },
];

export function FeaturesGrid() {
  return (
    <SectionShell>
      <SectionHeader
        badge="Features"
        title="Everything you need to find and close B2B leads"
        subtitle="Purpose-built tools for modern outbound — from prompt to export."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES.map((f, i) => (
          <FadeIn key={f.title} delay={i * 0.08}>
            <div className="h-full rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow">
              <f.icon className="w-8 h-8 text-lp-ice-blue mb-4" />
              <h3 className="font-semibold text-lp-white">{f.title}</h3>
              <p className="text-sm text-lp-muted mt-2 leading-relaxed">{f.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
