"use client";

import { useSignIn } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getClerkErrorFromReturn,
  getSignInHookFieldErrors,
  getSignInHookGlobalError,
} from "@/lib/auth/clerk-errors";
import { forgotEmailSchema, resetPasswordSchema } from "@/lib/auth/validation";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";
import { SecurityBadge } from "./SecurityBadge";

type Step = "email" | "reset";

export function ForgotPasswordForm() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSubmitting = fetchStatus === "fetching";

  function clearErrors() {
    setFormError(null);
    setFieldErrors({});
  }

  function applyHookErrors(fallback: string) {
    const mapped = getSignInHookFieldErrors(errors);
    if (Object.keys(mapped).length > 0) {
      setFieldErrors(mapped);
    }
    const global = getSignInHookGlobalError(errors, fallback);
    if (global) {
      setFormError(global);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;

    clearErrors();

    const parsed = forgotEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors({ email: parsed.error.issues[0]?.message ?? "Invalid email." });
      return;
    }

    const { error: createError } = await signIn.create({ identifier: parsed.data.email });
    if (createError) {
      // Do not reveal whether the account exists.
      setStep("reset");
      setFormError("If an account exists for this email, a reset code has been sent.");
      return;
    }

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setStep("reset");
      setFormError("If an account exists for this email, a reset code has been sent.");
      return;
    }

    setStep("reset");
    setFormError(null);
  }

  async function handleResendCode() {
    if (!signIn) return;
    clearErrors();

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      applyHookErrors("Could not resend the code. Please try again.");
      return;
    }

    setFormError("A new reset code was sent to your email.");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;

    clearErrors();

    const parsed = resetPasswordSchema.safeParse({ code, password, confirmPassword });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0]?.toString() ?? "form";
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      });
      setFieldErrors(nextErrors);
      return;
    }

    const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({
      code: parsed.data.code,
    });
    if (verifyError) {
      const message = getClerkErrorFromReturn(
        verifyError,
        "That verification code is incorrect or expired. Check your email and try again."
      );
      if (
        verifyError.code === "form_code_incorrect" ||
        ("meta" in verifyError &&
          (verifyError as { meta?: { paramName?: string } }).meta?.paramName === "code")
      ) {
        setFieldErrors({ code: message });
      } else {
        setFormError(message);
      }
      return;
    }

    if (signIn.status !== "needs_new_password") {
      setFormError("Something went wrong. Please request a new code and try again.");
      return;
    }

    const { error: passwordError } = await signIn.resetPasswordEmailCode.submitPassword({
      password: parsed.data.password,
      signOutOfOtherSessions: true,
    });
    if (passwordError) {
      const message = getClerkErrorFromReturn(passwordError, "Could not update your password. Please try again.");
      if (
        passwordError.code?.startsWith("form_password") ||
        ("meta" in passwordError &&
          (passwordError as { meta?: { paramName?: string } }).meta?.paramName === "password")
      ) {
        setFieldErrors({ password: message });
      } else {
        setFormError(message);
      }
      applyHookErrors(message);
      return;
    }

    const signInStatus = signIn.status as string;
    if (signInStatus !== "complete") {
      setFormError("Password updated, but sign-in could not be completed. Try signing in with your new password.");
      return;
    }

    const { error: finalizeError } = await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        router.push(decorateUrl("/auth/continue"));
      },
    });

    if (finalizeError) {
      setFormError(getClerkErrorFromReturn(finalizeError, "Password updated. Please sign in with your new password."));
    }
  }

  return (
    <AuthCard>
      <SecurityBadge label="Secure password reset" />

      <h1 className="text-2xl font-bold tracking-tight text-lp-white">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-lp-muted">
        {step === "email"
          ? "Enter your work email and we'll send a verification code."
          : "Enter the code from your email and choose a new password."}
      </p>

      {step === "email" ? (
        <form onSubmit={handleSendCode} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="reset-email" className="mb-1.5 block text-xs font-medium text-lp-muted">
              Work email
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="work@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`auth-input w-full ${fieldErrors.email ? "border-rose-400/60" : ""}`}
            />
            {fieldErrors.email && (
              <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.email}</p>
            )}
          </div>
          {formError && <p className="text-xs text-lp-muted">{formError}</p>}
          <button
            type="submit"
            disabled={isSubmitting || !signIn}
            className="auth-submit-btn flex w-full items-center justify-center gap-2 btn-lift"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isSubmitting ? "Sending…" : "Send reset code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="reset-code" className="mb-1.5 block text-xs font-medium text-lp-muted">
              Verification code
            </label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`auth-input w-full ${fieldErrors.code ? "border-rose-400/60" : ""}`}
            />
            {fieldErrors.code && <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.code}</p>}
          </div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
          />
          {formError && (
            <p
              className={`text-center text-xs ${formError.includes("sent") ? "text-lp-muted" : "text-rose-400"}`}
              role="alert"
            >
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !signIn}
            className="auth-submit-btn flex w-full items-center justify-center gap-2 btn-lift"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isSubmitting ? "Updating…" : "Update password"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleResendCode}
            className="w-full text-center text-xs text-lp-ice-blue hover:underline disabled:opacity-50"
          >
            Resend code
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-lp-muted">
        <Link href="/login" className="font-medium text-lp-ice-blue hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
