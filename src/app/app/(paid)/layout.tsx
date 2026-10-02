import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isOnboardingComplete } from "@/lib/context/userLeadContext";

// Users without a paid plan get in on the free trial; plan limits are enforced per search.
export default async function PaidAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const complete = await isOnboardingComplete(user.id);
  if (!complete) {
    redirect("/onboarding");
  }

  return children;
}
