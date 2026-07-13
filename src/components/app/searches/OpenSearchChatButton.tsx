"use client";

import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { stashRestoreSearchId } from "@/lib/search-restore";
import { cn } from "@/lib/utils/cn";

type OpenSearchChatButtonProps = {
  searchId: string;
  refine?: boolean;
  className?: string;
  label?: string;
  showIcon?: boolean;
};

export function OpenSearchChatButton({
  searchId,
  refine = false,
  className,
  label = "Open chat",
  showIcon = true,
}: OpenSearchChatButtonProps) {
  const router = useRouter();

  function handleOpen() {
    stashRestoreSearchId(searchId);
    const params = new URLSearchParams({ searchId });
    if (refine) params.set("refine", "1");
    router.push(`/app?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-lp-border bg-lp-panel px-4 py-2.5 text-sm font-medium text-lp-off-white transition-colors hover:border-lp-border-strong hover:bg-lp-panel-strong",
        className
      )}
    >
      {showIcon && <MessageSquare className="h-4 w-4" />}
      {label}
    </button>
  );
}
