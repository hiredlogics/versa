import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthRedirectIfSignedIn } from "@/components/auth/AuthRedirectIfSignedIn";
import { redirectIfAuthenticated } from "@/lib/auth/post-auth-redirect";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ login?: string[] }>;
}) {
  await redirectIfAuthenticated();

  const { login } = await params;

  if (login?.length) {
    return (
      <AuthShell>
        <AuthRedirectIfSignedIn>
          <div className="flex justify-center">
            <SignIn
              routing="path"
              path="/login"
              signUpUrl="/register"
              forceRedirectUrl="/auth/continue"
            />
          </div>
        </AuthRedirectIfSignedIn>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthRedirectIfSignedIn>
        <LoginForm />
      </AuthRedirectIfSignedIn>
    </AuthShell>
  );
}
