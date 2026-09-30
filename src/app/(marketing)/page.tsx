import type { Metadata } from "next";
import { HomeV2 } from "@/components/marketing/HomeV2";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} — B2B lead intelligence`,
  description: "Describe your buyer and get a ranked list of verified B2B leads with clear reasons for every match.",
  openGraph: {
    title: `${BRAND.name} — B2B lead intelligence`,
    description: "Describe your buyer and get a ranked list of verified B2B leads with clear reasons for every match.",
  },
};

export default function LandingPage() {
  return <HomeV2 />;
}
