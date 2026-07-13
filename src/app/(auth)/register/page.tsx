import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthRedirectIfSignedIn } from "@/components/auth/AuthRedirectIfSignedIn";
import { redirectIfAuthenticated } from "@/lib/auth/post-auth-redirect";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  await redirectIfAuthenticated();

  return (
    <AuthShell>
      <AuthRedirectIfSignedIn>
        <RegisterForm />
      </AuthRedirectIfSignedIn>
    </AuthShell>
  );
}
