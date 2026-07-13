import { TRUST_LOGOS } from "./constants";

export function TrustStrip() {
  const logos = [...TRUST_LOGOS, ...TRUST_LOGOS];

  return (
    <section className="relative border-y border-lp-border bg-lp-graphite py-8 overflow-hidden">
      <p className="text-center text-[10px] uppercase tracking-[0.2em] text-lp-muted-dark mb-6">
        Trusted by growing teams
      </p>
      <div className="relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
        <div className="flex animate-marquee gap-12 md:gap-16 whitespace-nowrap px-4">
          {logos.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="text-sm md:text-base font-semibold text-lp-muted/50 hover:text-lp-muted transition-colors"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
