import { AppProviders } from "@/components/providers/AppProviders";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="min-h-screen bg-lp-black text-lp-off-white transition-colors duration-300">
        {children}
      </div>
    </AppProviders>
  );
}
