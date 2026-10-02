import { FadeIn } from "./AnimatedAurora";

const TRUST_ITEMS = [
  "Encrypted workspace data",
  "Verified contact data",
  "Secure sign-in",
  "Secure payments",
  "Enterprise-grade reliability",
];

export function SecurityTrustStrip() {
  return (
    <section className="py-16 md:py-20 px-4 border-y border-lp-border bg-lp-graphite/50">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="text-center text-xs uppercase tracking-[0.2em] text-lp-muted-dark mb-8">
            Enterprise-grade security and reliability
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:gap-6">
            {TRUST_ITEMS.map((item) => (
              <span
                key={item}
                className="rounded-full border border-lp-border bg-lp-panel px-4 py-2 text-xs text-lp-muted"
              >
                {item}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
