import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getFullBillingStatus } from "@/lib/billing/billingDashboard";
import { BillingPageClient } from "@/components/app/billing/BillingPageClient";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const billing = await getFullBillingStatus(user.id);
  return <BillingPageClient initialBilling={billing} />;
}
