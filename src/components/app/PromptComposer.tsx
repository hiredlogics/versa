"use client";

import { Pencil, Sparkles, Square } from "lucide-react";
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
  onStop?: () => void;
  loading?: boolean;
  disabled?: boolean;
  editing?: boolean;
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
  onStop,
  loading,
  disabled,
  editing,
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
    if (loading) return;
    submitSearch();
  }

  function handlePromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (loading) return;
    if (!isEnterKey(e.key, e.code) || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submitSearch();
  }

  return (
    <form className="app-composer overflow-hidden" onSubmit={handleFormSubmit}>
      {editing && (
        <div className="flex items-center gap-2 border-b border-lp-border bg-lp-panel/50 px-4 py-2">
          <Pencil className="h-3.5 w-3.5 text-lp-ice-blue" />
          <p className="text-xs text-lp-ice-blue">Editing prompt — submit to run again</p>
        </div>
      )}

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
          {loading && onStop ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-2 border-rose-500/30 text-rose-200 hover:bg-rose-500/10"
              onClick={onStop}
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </Button>
          ) : (
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
                  {editing ? "Run edited prompt" : submitLabel}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
