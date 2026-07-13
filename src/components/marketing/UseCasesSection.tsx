import Link from "next/link";
import { FadeIn } from "./AnimatedAurora";
import { SectionHeader, SectionShell } from "./SectionShell";
import { BRAND } from "@/config/brand";

const USE_CASES = [
  {
    title: "SaaS outbound",
    desc: "Target founders and engineering leaders at growth-stage companies with AI-fit scoring.",
    tag: "Revenue teams",
  },
  {
    title: "Agency prospecting",
    desc: "Run repeatable ICP searches for multiple clients with saved lists and exports.",
    tag: "Agencies",
  },
  {
    title: "RevOps enrichment",
    desc: "Fill pipeline gaps with qualified contacts matched to your ideal customer profile.",
    tag: "RevOps",
  },
  {
    title: "Founder-led sales",
    desc: "Skip the spreadsheet. One prompt, ranked buyers, same-day outreach.",
    tag: "Founders",
  },
  {
    title: "Market expansion",
    desc: "Test new verticals and geographies with structured Apollo queries.",
    tag: "Growth",
  },
  {
    title: "Event & campaign lists",
    desc: "Build targeted lists for launches, webinars, and ABM campaigns.",
    tag: "Marketing",
  },
];

export function UseCasesSection() {
  return (
    <SectionShell id="use-cases">
      <SectionHeader
        badge="Use cases"
        title="Built for teams that sell to businesses"
        subtitle={`Whether you're a founder, agency, or RevOps lead — ${BRAND.name} adapts to how you prospect.`}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {USE_CASES.map((uc, i) => (
          <FadeIn key={uc.title} delay={i * 0.06}>
            <Link
              href="/use-cases"
              className="group block h-full rounded-2xl border border-lp-border bg-lp-panel p-6 card-glow transition-all hover:border-lp-ice-blue/30"
            >
              <span className="text-[10px] uppercase tracking-wider text-lp-ice-blue">{uc.tag}</span>
              <h3 className="mt-3 text-lg font-semibold text-lp-white group-hover:text-lp-ice-blue transition-colors">
                {uc.title}
              </h3>
              <p className="mt-2 text-sm text-lp-muted leading-relaxed">{uc.desc}</p>
            </Link>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}
