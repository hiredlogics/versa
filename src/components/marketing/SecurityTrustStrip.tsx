import { FadeIn } from "./AnimatedAurora";
import { BRAND } from "@/config/brand";

const TRUST_ITEMS = [
  "Server-side API keys",
  "Encrypted workspace data",
  "AI model fallback",
  "Apollo enrichment",
  "Stripe-secured billing",
];

const MODELS = ["OpenAI", "Groq", "Gemini", "Claude"];

export function SecurityTrustStrip() {
  return (
    <section className="py-16 md:py-20 px-4 border-y border-lp-border bg-lp-graphite/50">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="text-center text-[10px] uppercase tracking-[0.2em] text-lp-muted-dark mb-8">
            Enterprise-grade infrastructure
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:gap-6 mb-10">
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

        <FadeIn delay={0.1}>
          <div className="lp-glass-panel rounded-2xl border border-lp-border p-6 md:p-8 max-w-3xl mx-auto text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 mb-4">
              {MODELS.map((model, i) => (
                <span key={model} className="flex items-center gap-2">
                  <span className="rounded-lg border border-lp-border-strong bg-lp-charcoal px-4 py-2 text-sm font-medium text-lp-off-white">
                    {model}
                  </span>
                  {i < MODELS.length - 1 && (
                    <span className="text-lp-muted-dark hidden md:inline">→</span>
                  )}
                </span>
              ))}
            </div>
            <p className="text-sm text-lp-muted leading-relaxed">
              If one provider fails, {BRAND.name} automatically retries with the next model.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
