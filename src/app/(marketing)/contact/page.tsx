import { ContactHero } from "@/components/marketing/ContactHero";
import { ContactForm } from "@/components/marketing/ContactForm";
import { ContactProductPanel } from "@/components/marketing/ContactProductPanel";
import { SalesRoutingCards } from "@/components/marketing/SalesRoutingCards";
import { SecurityTrustStrip } from "@/components/marketing/SecurityTrustStrip";
import { ContactFAQ } from "@/components/marketing/ContactFAQ";
import { AnimatedColdBackground } from "@/components/marketing/AnimatedColdBackground";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact", description: "Talk to the Varsā team.", openGraph: { title: "Contact Varsā", description: "Talk to the Varsā team.", images: ["/og.png"] }, twitter: { card: "summary_large_image" } };

export default function ContactPage() {
  return (
    <div className="relative">
      <AnimatedColdBackground />
      <div className="relative z-10">
        <ContactHero />
        <section className="px-4 pb-16 md:pb-20">
          <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-8 lg:gap-10 items-start">
            <ContactForm />
            <ContactProductPanel />
          </div>
        </section>
        <SalesRoutingCards />
        <SecurityTrustStrip />
        <ContactFAQ />
      </div>
    </div>
  );
}
