"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export function AuthCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout
      className={cn("auth-card sm:p-8", className)}
      transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
    >
      {children}
    </motion.div>
  );
}
