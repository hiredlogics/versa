import { PricingCards, FAQSection } from "@/components/marketing/Sections";
import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for finding and qualifying B2B leads.",
  openGraph: {
    title: `${BRAND.name} Pricing`,
    description: "Simple plans for finding and qualifying B2B leads.",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

export default function PricingPage() {
  return (
    <div className="pt-24">
      <PricingCards />
      <FAQSection />
    </div>
  );
}
