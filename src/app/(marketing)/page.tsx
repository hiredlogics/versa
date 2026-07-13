import { HeroSection } from "@/components/marketing/HeroSection";
import { TrustStrip } from "@/components/marketing/TrustStrip";
import { ProductDemo } from "@/components/marketing/ProductDemo";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { SolutionSection } from "@/components/marketing/SolutionSection";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { AiScoringSection } from "@/components/marketing/AiScoringSection";
import { ApolloEnrichmentSection } from "@/components/marketing/ApolloEnrichmentSection";
import { FallbackModelsSection } from "@/components/marketing/FallbackModelsSection";
import { UseCasesSection } from "@/components/marketing/UseCasesSection";
import { PricingPreview } from "@/components/marketing/PricingPreview";
import { SecuritySection } from "@/components/marketing/SecuritySection";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTA } from "@/components/marketing/FinalCTA";

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <TrustStrip />
      <ProductDemo />
      <ProblemSection />
      <SolutionSection />
      <HowItWorks />
      <AiScoringSection />
      <ApolloEnrichmentSection />
      <FallbackModelsSection />
      <UseCasesSection />
      <PricingPreview />
      <SecuritySection />
      <FAQSection />
      <FinalCTA />
    </>
  );
}
