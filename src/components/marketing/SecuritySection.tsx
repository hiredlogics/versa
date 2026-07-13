import { Key, Lock, Server, ShieldCheck } from "lucide-react";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const ITEMS = [
  { icon: Lock, title: "Tenant isolation", desc: "Every workspace is scoped — your leads and searches stay private." },
  { icon: Key, title: "Encrypted API keys", desc: "Third-party keys stored securely, never exposed to the browser." },
  { icon: Server, title: "Reliable infrastructure", desc: "Multi-model AI fallback, async jobs, and failed search recovery." },
  { icon: ShieldCheck, title: "Stripe billing", desc: "Enterprise-grade payments with usage tracking and plan enforcement." },
];

export function SecuritySection() {
  return (
    <SectionShell id="security">
      <SectionHeader
        badge="Security & reliability"
        title="Enterprise-ready from day one"
        subtitle={`${BRAND.name} is built for teams that can't afford data leaks, downtime, or opaque AI behavior.`}
      />
      <div className="grid sm:grid-cols-2 gap-5">
        {ITEMS.map((item, i) => (
          <FadeIn key={item.title} delay={i * 0.08}>
            <div className="flex gap-4 rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow">
              <item.icon className="w-8 h-8 shrink-0 text-lp-success" />
              <div>
                <h3 className="font-semibold text-lp-white">{item.title}</h3>
                <p className="mt-1 text-sm text-lp-muted leading-relaxed">{item.desc}</p>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
