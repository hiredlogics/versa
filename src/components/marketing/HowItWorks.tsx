import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const STEPS = [
  {
    num: "01",
    title: "Describe your ideal buyer",
    desc: "Write a plain-language prompt — role, industry, company size, geography, and intent.",
  },
  {
    num: "02",
    title: "AI builds Apollo filters",
    desc: `${BRAND.name} parses your intent into structured search criteria and queries Apollo at scale.`,
  },
  {
    num: "03",
    title: "Enrich & score every lead",
    desc: "Contacts are enriched, ranked 1–10, and annotated with signals and outreach angles.",
  },
  {
    num: "04",
    title: "Export & activate",
    desc: "Download CSV or Excel, save lists, and move straight into your outreach stack.",
  },
];

export function HowItWorks() {
  return (
    <SectionShell id="how-it-works">
      <SectionHeader
        badge="Workflow"
        title="How it works"
        subtitle="From prompt to pipeline in four steps — no manual list building required."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {STEPS.map((step, i) => (
          <FadeIn key={step.num} delay={i * 0.1}>
            <div className="relative h-full rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow">
              <span className="text-3xl font-bold text-lp-ice-blue/30">{step.num}</span>
              <h3 className="mt-4 text-base font-semibold text-lp-white">{step.title}</h3>
              <p className="mt-2 text-sm text-lp-muted leading-relaxed">{step.desc}</p>
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-lp-border" aria-hidden />
              )}
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
