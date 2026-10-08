import { FeaturesGrid, HowItWorks } from "@/components/marketing/Sections";
import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "Features",
  description: `Find and qualify B2B leads with ${BRAND.name}.`,
  openGraph: {
    title: `${BRAND.name} Features`,
    description: `Find and qualify B2B leads with ${BRAND.name}.`,
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

export default function FeaturesPage() {
  return (
    <div className="pt-24">
      <FeaturesGrid />
      <HowItWorks />
    </div>
  );
}
