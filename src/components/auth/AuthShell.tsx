"use client";

import { motion } from "framer-motion";
import { AuthBackground } from "./AuthBackground";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/marketing/ThemeToggle";

export function AuthShell({
  children,
  showVisual = false,
}: {
  children: React.ReactNode;
  showVisual?: boolean;
}) {
  return (
    <div className="auth-shell-bg relative min-h-screen text-lp-white transition-colors duration-300">
      <AuthBackground />
      <div className="fixed top-5 right-5 z-20">
        <ThemeToggle />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <motion.div
          className="w-full max-w-[440px]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8 flex justify-center">
            <Logo size="lg" animated />
          </div>
          {children}
        </motion.div>
      </div>
      {showVisual && (
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 lg:block" aria-hidden />
      )}
    </div>
  );
}
