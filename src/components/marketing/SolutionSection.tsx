import { CheckCircle2 } from "lucide-react";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const POINTS = [
  "Natural-language ICP targeting — no filter gymnastics",
  "Apollo-powered enrichment with verified contact data",
  "AI scores every lead with reasoning you can trust",
  "Export to CSV or Excel and push into your workflow",
  "Multi-tenant workspace with usage limits and audit trails",
];

export function SolutionSection() {
  return (
    <SectionShell soft>
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <SectionHeader
          badge="The solution"
          title="Every lead is scored, explained, and ready for outreach."
          subtitle={`${BRAND.name} is purpose-built for revenue teams that need qualified buyers — not another contact dump.`}
          align="left"
        />
        <div className="space-y-4">
          {POINTS.map((point, i) => (
            <FadeIn key={point} delay={i * 0.08}>
              <div className="flex gap-3 rounded-xl border border-lp-border bg-lp-panel p-4 card-glow">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-lp-success mt-0.5" />
                <p className="text-sm text-lp-white">{point}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
