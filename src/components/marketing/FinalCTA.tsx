import Link from "next/link";
import { AnimatedAurora } from "./AnimatedAurora";
import { FadeIn } from "./AnimatedAurora";
import { BRAND } from "@/config/brand";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32 px-4 bg-lp-black border-t border-lp-border">
      <AnimatedAurora />
      <FadeIn className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-lp-white">
          Ready to build your next pipeline with {BRAND.name}?
        </h2>
        <p className="mt-4 text-base md:text-lg text-lp-muted">
          Join teams using {BRAND.name} to find qualified buyers — not raw contact lists.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/register" className="lp-btn-primary px-8 py-3.5 text-sm btn-lift">
            Start finding leads
          </Link>
          <Link href="/pricing" className="lp-btn-secondary px-8 py-3.5 text-sm btn-lift">
            View pricing
          </Link>
        </div>
      </FadeIn>
    </section>
  );
}
