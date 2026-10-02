import { PricingCards, FAQSection } from "@/components/marketing/Sections";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pricing", description: "Simple plans for lead discovery.", openGraph: { title: "Varsā Pricing", description: "Simple plans for lead discovery.", images: ["/og.png"] }, twitter: { card: "summary_large_image" } };

export default function PricingPage() {
  return (
    <div className="pt-24">
      <PricingCards />
      <FAQSection />
    </div>
  );
}
