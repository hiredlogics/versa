import { FeaturesGrid, HowItWorks } from "@/components/marketing/Sections";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Features", description: "Find and qualify leads with Varsā.", openGraph: { title: "Varsā Features", description: "Find and qualify leads with Varsā.", images: ["/og.png"] }, twitter: { card: "summary_large_image" } };

export default function FeaturesPage() {
  return (
    <div className="pt-24">
      <FeaturesGrid />
      <HowItWorks />
    </div>
  );
}
