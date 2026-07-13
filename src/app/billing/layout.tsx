import { AppProviders } from "@/components/providers/AppProviders";

export default function BillingFlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="min-h-screen bg-lp-black text-lp-off-white">{children}</div>
    </AppProviders>
  );
}
