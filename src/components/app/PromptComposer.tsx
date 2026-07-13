"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export interface ComposerValues {
  prompt: string;
  linkedinUrl: string;
  companyUrl: string;
  companyName: string;
}

interface PromptComposerProps {
  values: ComposerValues;
  onChange: (values: ComposerValues) => void;
  onSubmit: () => void;
  onOpenFilters: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  submitLabel?: string;
}

function isEnterKey(key: string, code: string) {
  return key === "Enter" || key === "NumpadEnter" || code === "Enter" || code === "NumpadEnter";
}

export function PromptComposer({
  values,
  onChange,
  onSubmit,
  onOpenFilters,
  loading,
  disabled,
  placeholder = "Find SaaS founders in the US with 20-300 employees who may need AI automation...",
  submitLabel = "Find leads",
}: PromptComposerProps) {
  const canSubmit =
    !loading &&
    !disabled &&
    (values.prompt.trim() || values.linkedinUrl || values.companyUrl || values.companyName);

  function submitSearch() {
    if (!canSubmit) return;
    onSubmit();
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitSearch();
  }

  function handlePromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isEnterKey(e.key, e.code) || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submitSearch();
  }

  return (
    <form className="app-composer overflow-hidden" onSubmit={handleFormSubmit}>
      <div className="p-4">
        <textarea
          rows={3}
          value={values.prompt}
          onChange={(e) => onChange({ ...values, prompt: e.target.value })}
          onKeyDown={handlePromptKeyDown}
          disabled={loading || disabled}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-lp-white placeholder:text-lp-muted-dark focus:outline-none disabled:opacity-50"
        />
      </div>

      <div className="grid gap-2 border-t border-lp-border bg-lp-panel/40 px-4 py-3 sm:grid-cols-3">
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          value={values.linkedinUrl}
          onChange={(e) => onChange({ ...values, linkedinUrl: e.target.value })}
          disabled={loading || disabled}
          placeholder="LinkedIn profile URL"
          className="app-input text-xs"
        />
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          value={values.companyUrl}
          onChange={(e) => onChange({ ...values, companyUrl: e.target.value })}
          disabled={loading || disabled}
          placeholder="Company URL"
          className="app-input text-xs"
        />
        <input
          type="text"
          autoComplete="off"
          value={values.companyName}
          onChange={(e) => onChange({ ...values, companyName: e.target.value })}
          disabled={loading || disabled}
          placeholder="Company name"
          className="app-input text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-lp-border px-4 py-3">
        <button
          type="button"
          onClick={onOpenFilters}
          disabled={loading || disabled}
          className="text-xs font-medium text-lp-muted transition-colors hover:text-lp-ice-blue disabled:opacity-50"
        >
          Advanced filters
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-lp-muted-dark sm:inline">
            Enter to search · Shift+Enter for new line
          </span>
          <Button
            type="submit"
            disabled={!canSubmit}
            size="sm"
            className={cn("gap-2", loading && "opacity-80")}
          >
            {loading ? (
              <>
                <span className="flex gap-1">
                  <span className="app-signal-dot h-1.5 w-1.5 rounded-full bg-lp-black" />
                  <span className="app-signal-dot h-1.5 w-1.5 rounded-full bg-lp-black" />
                  <span className="app-signal-dot h-1.5 w-1.5 rounded-full bg-lp-black" />
                </span>
                Searching…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
