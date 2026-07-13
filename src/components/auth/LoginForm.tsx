"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginSchema } from "@/lib/auth/validation";
import { getClerkErrorMessage } from "@/lib/auth/clerk-errors";
import { AuthCard } from "./AuthCard";
import { AuthDivider } from "./AuthDivider";
import { ClerkCaptcha } from "./ClerkCaptcha";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordInput } from "./PasswordInput";
import { SecurityBadge } from "./SecurityBadge";
import { BRAND } from "@/config/brand";

export function LoginForm() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      router.replace("/auth/continue");
    }
  }, [authLoaded, isSignedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (isSignedIn) {
      router.replace("/auth/continue");
      return;
    }

    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0]?.toString() ?? "form";
        if (!errors[key]) errors[key] = issue.message;
      });
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await signIn.create({
        identifier: parsed.data.email,
        password: parsed.data.password,
      });

      if (signIn.status === "complete" && signIn.createdSessionId) {
        await setActive({ session: signIn.createdSessionId });
        router.push("/auth/continue");
        return;
      }

      setFormError("Invalid email or password.");
    } catch (err) {
      const message = getClerkErrorMessage(err, "Invalid email or password.");
      if (message === "redirect") {
        router.replace("/auth/continue");
        return;
      }
      setFormError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard>
      <SecurityBadge label="Secure workspace access" />

      <h1 className="text-2xl font-bold tracking-tight text-lp-white">Welcome back</h1>
      <p className="mt-2 text-sm leading-relaxed text-lp-muted">
        Sign in to continue building qualified lead pipelines from one intelligent prompt.
      </p>

      <div className="mt-6">
        <OAuthButtons mode="login" />
      </div>

      <AuthDivider label="Or use a work email" />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-lp-muted">
            Work email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="work@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`auth-input w-full ${fieldErrors.email ? "border-rose-400/60" : ""}`}
            aria-invalid={!!fieldErrors.email}
          />
          {fieldErrors.email && (
            <p className="mt-1.5 text-xs text-rose-400" role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <PasswordInput
          label="Password"
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-lp-ice-blue hover:underline">
            Forgot password?
          </Link>
        </div>

        {formError && (
          <p className="text-center text-xs text-rose-400" role="alert">
            {formError}
          </p>
        )}

        <ClerkCaptcha />

        <button
          type="submit"
          disabled={loading || !isLoaded}
          className="auth-submit-btn flex w-full items-center justify-center gap-2 btn-lift"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-lp-muted">
        New to {BRAND.name}?{" "}
        <Link href="/register" className="font-medium text-lp-ice-blue hover:underline">
          Create an account
        </Link>
      </p>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-lp-muted-dark">
        Protected by secure authentication, encrypted sessions, and workspace-level access controls.
      </p>
    </AuthCard>
  );
}
