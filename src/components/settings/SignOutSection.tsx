"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clearRestoreSearchId } from "@/lib/search-restore";

export function SignOutSection({ embedded = false }: { embedded?: boolean }) {
  const { signOut } = useClerk();

  async function handleSignOut() {
    clearRestoreSearchId();
    await signOut({ redirectUrl: "/login" });
  }

  if (embedded) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-lp-muted">
          You will be returned to the login screen. Unsaved draft searches in this tab will be cleared.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSignOut}
          className="shrink-0 gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="app-panel rounded-xl p-6">
      <h2 className="text-sm font-semibold text-lp-white">Sign out</h2>
      <p className="mt-1 text-xs text-lp-muted">
        End your session on this device and return to the login page.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleSignOut}
        className="mt-4 gap-2"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
