import { MarketingChrome } from "@/components/marketing/MarketingChrome";
import { AppProviders } from "@/components/providers/AppProviders";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="min-h-screen bg-lp-black text-lp-off-white transition-colors duration-300">
        <MarketingChrome>{children}</MarketingChrome>
      </div>
    </AppProviders>
  );
}
