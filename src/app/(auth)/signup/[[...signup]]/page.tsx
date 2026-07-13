import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthRedirectIfSignedIn } from "@/components/auth/AuthRedirectIfSignedIn";
import { redirectIfAuthenticated } from "@/lib/auth/post-auth-redirect";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ signup?: string[] }>;
}) {
  await redirectIfAuthenticated();

  const { signup } = await params;

  if (!signup?.length) {
    redirect("/register");
  }

  return (
    <AuthShell>
      <AuthRedirectIfSignedIn>
        <div className="flex justify-center">
          <SignUp
            routing="path"
            path="/signup"
            signInUrl="/login"
            forceRedirectUrl="/auth/continue"
          />
        </div>
      </AuthRedirectIfSignedIn>
    </AuthShell>
  );
}
