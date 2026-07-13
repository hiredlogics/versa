import { AppProviders } from "@/components/providers/AppProviders";

export default function AuthContinueLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
