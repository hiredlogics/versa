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
  const [verificationStep, setVerificationStep] = useState<"first" | "second" | null>(null);
  const [verificationCode, setVerificationCode] = useState("");

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
      const result = await signIn.create({
        identifier: parsed.data.email,
        password: parsed.data.password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push("/auth/continue");
        return;
      }
      if (result.status === "needs_second_factor") {
        await result.prepareSecondFactor({ strategy: "email_code" });
        setVerificationStep("second");
        return;
      }
      if (result.status === "needs_first_factor" || result.status === "needs_identifier") {
        const emailFactor = result.supportedFirstFactors?.find(
          (factor) => factor.strategy === "email_code"
        );
        if (!emailFactor || emailFactor.strategy !== "email_code") {
          setFormError("Additional verification is required. Please try again or contact support.");
          return;
        }
        await result.prepareFirstFactor({ strategy: "email_code", emailAddressId: emailFactor.emailAddressId });
        setVerificationStep("first");
        return;
      }
      setFormError("Additional verification is required. Please try again or contact support.");
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

  async function handleVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn || !verificationStep) return;
    setFormError(null);
    setLoading(true);
    try {
      const result = verificationStep === "second"
        ? await signIn.attemptSecondFactor({ strategy: "email_code", code: verificationCode })
        : await signIn.attemptFirstFactor({ strategy: "email_code", code: verificationCode });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push("/auth/continue");
        return;
      }
      setFormError("Additional verification is required. Please try again or contact support.");
    } catch (err) {
      setFormError(getClerkErrorMessage(err, "The verification code could not be confirmed."));
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

      {verificationStep ? (
        <form onSubmit={handleVerification} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-code" className="mb-1.5 block text-xs font-medium text-lp-muted">Enter the 6-digit code</label>
            <input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} className="auth-input w-full" aria-describedby={formError ? "login-code-error" : undefined} />
          </div>
          {formError && <p id="login-code-error" className="text-center text-xs text-rose-400" role="alert">{formError}</p>}
          <button type="submit" disabled={loading || verificationCode.length !== 6} className="auth-submit-btn flex w-full items-center justify-center gap-2 btn-lift">{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{loading ? "Verifying…" : "Verify"}</button>
          <button type="button" onClick={() => { setVerificationStep(null); setVerificationCode(""); setFormError(null); }} className="w-full text-sm text-lp-ice-blue hover:underline">Back</button>
        </form>
      ) : <>
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
      </>}

      <p className="mt-6 text-center text-sm text-lp-muted">
        New to {BRAND.name}?{" "}
        <Link href="/register" className="font-medium text-lp-ice-blue hover:underline">
          Create an account
        </Link>
      </p>

      <p className="mt-4 text-center text-xs leading-relaxed text-lp-muted-dark">
        Protected by secure authentication, encrypted sessions, and workspace-level access controls.
      </p>
    </AuthCard>
  );
}
