import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getBillingStatus } from "@/lib/billing/subscription";
import { isOnboardingComplete } from "@/lib/context/userLeadContext";

export default async function PaidAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const billing = await getBillingStatus(user.id);

  if (!billing.hasActiveSubscription) {
    redirect("/pricing");
  }

  const complete = await isOnboardingComplete(user.id);
  if (!complete) {
    redirect("/onboarding");
  }

  return children;
}
