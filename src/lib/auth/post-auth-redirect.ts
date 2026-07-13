import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getPostAuthRedirectPath } from "@/lib/billing/subscription";

/**
 * Server-side guard for auth pages.
 * Only redirects when the DB user can be loaded — avoids loops when Clerk
 * has a stale cookie but token refresh fails.
 */
export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();
  if (!user) return;

  redirect(await getPostAuthRedirectPath(user));
}
