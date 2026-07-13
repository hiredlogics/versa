import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { BRAND } from "@/config/brand";
import { LogoMark, type LogoMarkSize } from "./LogoMark";

const WORDMARK_SIZE = {
  sm: "text-[1rem]",
  md: "text-[1.125rem]",
  lg: "text-[1.375rem]",
} as const;

export type LogoProps = {
  size?: LogoMarkSize;
  animated?: boolean;
  className?: string;
  href?: string;
  showText?: boolean;
  /** @deprecated Use size="lg" instead */
  variant?: "default" | "nav";
};

export function Logo({
  className,
  href = "/",
  showText = true,
  size,
  animated = true,
  variant = "default",
}: LogoProps) {
  const resolvedSize: LogoMarkSize = size ?? (variant === "nav" ? "lg" : "md");

  return (
    <Link
      href={href}
      className={cn(
        "varsa-logo versa-logo lp-logo group relative inline-flex items-center transition-all duration-300",
        resolvedSize === "lg" ? "gap-3.5" : "gap-3",
        animated && "varsa-logo--animated versa-logo--animated",
        className
      )}
      aria-label={`${BRAND.fullName} home`}
    >
      <span
        className="versa-logo-accent lp-logo-accent pointer-events-none absolute -inset-3 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />

      <LogoMark size={resolvedSize} animated={animated} />

      {showText && (
        <span
          className={cn(
            "varsa-logo-wordmark versa-logo-wordmark lp-logo-wordmark relative font-black lowercase tracking-[-0.045em] leading-none",
            WORDMARK_SIZE[resolvedSize]
          )}
        >
          <span className="varsa-logo-wordmark-primary">{BRAND.wordmarkPrimary}</span>
          <span className="varsa-logo-wordmark-accent versa-logo-wordmark-accent lp-logo-wordmark-accent">
            {BRAND.wordmarkAccent}
          </span>
        </span>
      )}
    </Link>
  );
}
