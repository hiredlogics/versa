import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { AppProviders } from "@/components/providers/AppProviders";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="min-h-screen bg-lp-black text-lp-off-white transition-colors duration-300">
        <MarketingNavbar />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </AppProviders>
  );
}
