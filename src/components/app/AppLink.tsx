"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function AppLink({
  href,
  children,
  className,
  external,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("app-link inline-flex items-center gap-1.5", className)}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cn("app-link inline-flex items-center gap-1.5", className)}>
      {children}
    </Link>
  );
}
