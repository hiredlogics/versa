import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getPostAuthRedirectPath } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

export default async function AuthContinuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=session_expired");

  redirect(await getPostAuthRedirectPath(user));
}
