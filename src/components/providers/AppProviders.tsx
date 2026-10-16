"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { AuthSessionSync } from "@/components/auth/AuthSessionSync";
import { ClerkFirstUserToastDismissal } from "@/components/auth/ClerkFirstUserToastDismissal";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/auth/continue"
      signUpFallbackRedirectUrl="/auth/continue"
    >
      <AuthSessionSync />
      <ClerkFirstUserToastDismissal />
      {children}
    </ClerkProvider>
  );
}
