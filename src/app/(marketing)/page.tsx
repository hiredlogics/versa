import type { Metadata } from "next";
import { HomeV2 } from "@/components/marketing/HomeV2";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} — AI lead finder`,
  description: "Describe the people you want or paste a job description, and get a ranked list of leads with verified emails and a clear reason for every match.",
  openGraph: {
    title: `${BRAND.name} — AI lead finder`,
    description: "Describe the people you want or paste a job description, and get a ranked list of leads with verified emails and a clear reason for every match.",
  },
};

export default function LandingPage() {
  return <HomeV2 />;
}
