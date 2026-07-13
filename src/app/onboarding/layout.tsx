import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getBillingStatus } from "@/lib/billing/subscription";
import { isOnboardingComplete } from "@/lib/context/userLeadContext";
import { AppProviders } from "@/components/providers/AppProviders";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const billing = await getBillingStatus(user.id);

  if (!billing.hasActiveSubscription) {
    redirect("/pricing");
  }

  const complete = await isOnboardingComplete(user.id);
  if (complete) {
    redirect("/app");
  }

  return <AppProviders>{children}</AppProviders>;
}
