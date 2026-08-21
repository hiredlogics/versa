"use client";

import Link from "next/link";
import { AlertTriangle, CreditCard, Lock, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type SearchErrorKind =
  | "missing_prompt"
  | "unauthorized"
  | "subscription"
  | "usage_limit"
  | "rate_limit"
  | "network"
  | "apollo"
  | "scoring"
  | "empty"
  | "still_running"
  | "generic";

export function SearchErrorCard({
  kind,
  message,
  onRetry,
}: {
  kind: SearchErrorKind;
  message: string;
  onRetry?: () => void;
}) {
  const config: Record<
    SearchErrorKind,
    { icon: React.ReactNode; title: string; action?: React.ReactNode }
  > = {
    missing_prompt: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
      title: "Enter a search prompt",
    },
    unauthorized: {
      icon: <Lock className="h-5 w-5 text-lp-cold-blue" />,
      title: "Sign in required",
      action: (
        <Link href="/login">
          <Button size="sm">Sign in</Button>
        </Link>
      ),
    },
    subscription: {
      icon: <CreditCard className="h-5 w-5 text-lp-ice-blue" />,
      title: "Active subscription required",
      action: (
        <Link href="/app/billing">
          <Button size="sm" variant="secondary">
            View billing
          </Button>
        </Link>
      ),
    },
    usage_limit: {
      icon: <CreditCard className="h-5 w-5 text-amber-400" />,
      title: "Usage limit reached",
      action: (
        <Link href="/app/billing">
          <Button size="sm">Upgrade plan</Button>
        </Link>
      ),
    },
    rate_limit: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
      title: "Rate limit reached",
    },
    network: {
      icon: <WifiOff className="h-5 w-5 text-lp-muted" />,
      title: "Network error",
    },
    apollo: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
      title: "Search temporarily unavailable",
    },
    scoring: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
      title: "Partial scoring failure",
    },
    empty: {
      icon: <AlertTriangle className="h-5 w-5 text-lp-muted" />,
      title: "No leads found",
    },
    still_running: {
      icon: <AlertTriangle className="h-5 w-5 text-lp-ice-blue" />,
      title: "Still processing",
    },
    generic: {
      icon: <AlertTriangle className="h-5 w-5 text-red-400" />,
      title: "Search failed",
    },
  };

  const { icon, title, action } = config[kind];

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <div className="flex gap-3">
        <div className="shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-lp-white">{title}</p>
          <p className="mt-1 text-sm text-lp-muted">{message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            )}
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}
