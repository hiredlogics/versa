"use client";

import { useSignUp, useAuth } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { registerSchema, verificationCodeSchema } from "@/lib/auth/validation";
import {
  getClerkErrorFromReturn,
  getSignUpHookFieldErrors,
  getSignUpHookGlobalError,
} from "@/lib/auth/clerk-errors";
import { AuthCard } from "./AuthCard";
import { AuthDivider } from "./AuthDivider";
import { ClerkCaptcha } from "./ClerkCaptcha";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordInput } from "./PasswordInput";
import { SecurityBadge } from "./SecurityBadge";

const expandVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: "auto",
    transition: {
      height: { duration: 0.35, ease: "easeOut" as const },
      opacity: { duration: 0.25, delay: 0.05 },
      staggerChildren: 0.07,
      delayChildren: 0.08,
    },
  },
};

const fieldVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export function RegisterForm() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();

  const [showVerify, setShowVerify] = useState(false);
  const [emailStarted, setEmailStarted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const isSubmitting = fetchStatus === "fetching";

  const needsEmailVerification = useMemo(
    () =>
      signUp.status === "missing_requirements" &&
      signUp.unverifiedFields.includes("email_address") &&
      signUp.missingFields.length === 0,
    [signUp.missingFields.length, signUp.status, signUp.unverifiedFields]
  );

  const verifyStep = showVerify || needsEmailVerification;
  const verifyEmail = signUp.emailAddress || email;

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      router.replace("/auth/continue");
    }
  }, [authLoaded, isSignedIn, router]);

  function clearErrors() {
    setFormError(null);
    setFieldErrors({});
  }

  function applyHookErrors(fallback: string) {
    const mapped = getSignUpHookFieldErrors(errors);
    if (Object.keys(mapped).length > 0) {
      setFieldErrors(mapped);
    }
    const global = getSignUpHookGlobalError(errors, fallback);
    if (global) {
      setFormError(global);
    }
  }

  function triggerExpand() {
    if (!emailStarted) setEmailStarted(true);
  }

  async function finalizeSignUp() {
    const { error } = await signUp.finalize({
      navigate: ({ decorateUrl }) => {
        router.push(decorateUrl("/auth/continue"));
      },
    });

    if (error) {
      setFormError(getClerkErrorFromReturn(error, "Could not finish signup. Please try again."));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSignedIn) {
      router.replace("/auth/continue");
      return;
    }
    clearErrors();

    const parsed = registerSchema.safeParse({
      email,
      firstName,
      lastName,
      password,
      confirmPassword,
      acceptedTerms,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0]?.toString() ?? "form";
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      });
      setFieldErrors(nextErrors);
      setEmailStarted(true);
      return;
    }

    const { error } = await signUp.password({
      emailAddress: parsed.data.email,
      password: parsed.data.password,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      legalAccepted: true,
    });

    if (error) {
      applyHookErrors("Something went wrong. Please try again.");
      setFormError(getClerkErrorFromReturn(error, "Something went wrong. Please try again."));
      return;
    }

    if (signUp.status === "complete") {
      await finalizeSignUp();
      return;
    }

    const sendResult = await signUp.verifications.sendEmailCode();
    if (sendResult.error) {
      applyHookErrors("Could not send verification code. Please try again.");
      setFormError(
        getClerkErrorFromReturn(sendResult.error, "Could not send verification code. Please try again.")
      );
      return;
    }

    setShowVerify(true);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();

    const parsed = verificationCodeSchema.safeParse(verificationCode);
    if (!parsed.success) {
      setFieldErrors({ code: parsed.error.issues[0]?.message ?? "Invalid code." });
      return;
    }

    const { error } = await signUp.verifications.verifyEmailCode({ code: parsed.data });
    if (error) {
      applyHookErrors("Invalid verification code. Please try again.");
      setFormError(getClerkErrorFromReturn(error, "Invalid verification code. Please try again."));
      return;
    }

    if (signUp.status === "complete") {
      await finalizeSignUp();
      return;
    }

    setFormError("Verification incomplete. Check your code and try again.");
  }

  async function handleResendCode() {
    clearErrors();

    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      setFormError(getClerkErrorFromReturn(error, "Could not resend the code. Please try again."));
      return;
    }

    setFormError("A new verification code was sent to your email.");
  }

  async function handleBackToSignup() {
    clearErrors();
    setVerificationCode("");
    setShowVerify(false);
    await signUp.reset();
  }

  if (verifyStep) {
    return (
      <AuthCard>
        <SecurityBadge label="Verify your email" />

        <h1 className="text-2xl font-bold tracking-tight text-lp-white">Check your inbox</h1>
        <p className="mt-2 text-sm leading-relaxed text-lp-muted">
          We sent a 6-digit code to <span className="text-lp-white">{verifyEmail}</span>. Enter it below
          to activate your workspace.
        </p>

        <form onSubmit={handleVerify} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="verify-code" className="mb-1.5 block text-xs font-medium text-lp-muted">
              Verification code
            </label>
            <input
              id="verify-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className={`auth-input w-full ${fieldErrors.code ? "border-rose-400/60" : ""}`}
              aria-invalid={!!fieldErrors.code}
            />
            {fieldErrors.code && (
              <p className="mt-1.5 text-xs text-rose-400" role="alert">
                {fieldErrors.code}
              </p>
            )}
          </div>

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
            disabled={isSubmitting}
            className="auth-submit-btn flex w-full items-center justify-center gap-2 btn-lift"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isSubmitting ? "Verifying…" : "Verify and continue"}
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

        <p className="mt-6 text-center text-sm text-lp-muted">
          <button
            type="button"
            onClick={handleBackToSignup}
            className="font-medium text-lp-ice-blue hover:underline"
          >
            Back to signup
          </button>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <SecurityBadge label="Secure workspace signup" />

      <h1 className="text-2xl font-bold tracking-tight text-lp-white">
        Create your lead intelligence workspace
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-lp-muted">
        Start finding, scoring, and saving qualified B2B leads from one prompt.
      </p>

      <div className="mt-6">
        <OAuthButtons mode="register" />
      </div>

      <AuthDivider label="Or use a work email" />

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="register-email" className="mb-1.5 block text-xs font-medium text-lp-muted">
            Work email
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="work@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              triggerExpand();
            }}
            onFocus={triggerExpand}
            className={`auth-input w-full ${fieldErrors.email ? "border-rose-400/60" : ""}`}
            aria-invalid={!!fieldErrors.email}
          />
          {fieldErrors.email && (
            <p className="mt-1.5 text-xs text-rose-400" role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <AnimatePresence initial={false}>
          {emailStarted && (
            <motion.div
              key="expanded-fields"
              className="overflow-hidden"
              variants={expandVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <motion.div variants={fieldVariants} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="first-name" className="mb-1.5 block text-xs font-medium text-lp-muted">
                    First name
                  </label>
                  <input
                    id="first-name"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={`auth-input w-full ${fieldErrors.firstName ? "border-rose-400/60" : ""}`}
                  />
                  {fieldErrors.firstName && (
                    <p className="mt-1 text-xs text-rose-400">{fieldErrors.firstName}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="last-name" className="mb-1.5 block text-xs font-medium text-lp-muted">
                    Last name
                  </label>
                  <input
                    id="last-name"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={`auth-input w-full ${fieldErrors.lastName ? "border-rose-400/60" : ""}`}
                  />
                  {fieldErrors.lastName && (
                    <p className="mt-1 text-xs text-rose-400">{fieldErrors.lastName}</p>
                  )}
                </div>
              </motion.div>

              <motion.div variants={fieldVariants} className="mt-4">
                <PasswordInput
                  label="Password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fieldErrors.password}
                />
                <p className="mt-1.5 text-[11px] text-lp-muted-dark">
                  Min 8 characters · uppercase · lowercase · number · special character
                </p>
              </motion.div>

              <motion.div variants={fieldVariants} className="mt-4">
                <PasswordInput
                  label="Confirm password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={fieldErrors.confirmPassword}
                />
              </motion.div>

              <motion.div variants={fieldVariants} className="mt-4">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-lp-border bg-lp-panel accent-lp-ice-blue"
                  />
                  <span className="text-xs leading-relaxed text-lp-muted">
                    I agree to the{" "}
                    <Link href="/contact" className="text-lp-ice-blue hover:underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/contact" className="text-lp-ice-blue hover:underline">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                {fieldErrors.acceptedTerms && (
                  <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.acceptedTerms}</p>
                )}
              </motion.div>

              <motion.div variants={fieldVariants} className="mt-6">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="auth-submit-btn flex w-full items-center justify-center gap-2 btn-lift"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {isSubmitting ? "Creating workspace…" : "Create workspace"}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ClerkCaptcha />
        {fieldErrors.captcha && (
          <p className="mt-2 text-xs text-rose-400" role="alert">
            {fieldErrors.captcha}
          </p>
        )}

        {formError && (
          <p className="mt-4 text-center text-xs text-rose-400" role="alert">
            {formError}
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-lp-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-lp-ice-blue hover:underline">
          Sign in
        </Link>
      </p>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-lp-muted-dark">
        Protected by secure authentication, encrypted sessions, and access controls for each workspace.
      </p>
    </AuthCard>
  );
}
