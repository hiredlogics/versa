"use client";

import Link from "next/link";

export type PlatformStatus = {
  apollo: boolean;
  ai: boolean;
  leadSearchReady: boolean;
  isAdmin?: boolean;
};

const USER_MESSAGE =
  "Lead search is temporarily unavailable. Our team has been notified — please try again shortly.";

export function PlatformStatusBanner({ status }: { status: PlatformStatus | null }) {
  if (!status || status.leadSearchReady) return null;

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
      <p className="text-sm font-medium text-amber-100">Search unavailable</p>
      <p className="mt-1 text-sm leading-relaxed text-amber-200/80">
        {status.isAdmin ? (
          <>
            The lead data provider (Apollo) is not configured on this server. Add your platform key in{" "}
            <Link href="/admin/api-keys" className="font-medium text-lp-ice-blue underline underline-offset-2">
              Admin → API Keys
            </Link>{" "}
            to enable lead search.
          </>
        ) : (
          USER_MESSAGE
        )}
      </p>
    </div>
  );
}

export function providerErrorMessage(isAdmin?: boolean) {
  return isAdmin
    ? "Lead search is unavailable — configure Apollo in Admin → API Keys."
    : USER_MESSAGE;
}
