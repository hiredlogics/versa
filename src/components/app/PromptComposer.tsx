"use client";

import { Pencil, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export interface ComposerValues {
  prompt: string;
  linkedinUrl: string;
  companyUrl: string;
  companyName: string;
  jobDescription?: string;
  mode?: "describe" | "job_description" | "linkedin" | "company";
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
  // The parent owns the mode, so a reset or restored search always shows the right tab.
  const mode = values.mode ?? "describe";
  const tabs = ["describe", "job_description", "linkedin", "company"] as const;

  const currentText = mode === "job_description" ? values.jobDescription ?? values.prompt : values.prompt;
  const canSubmit =
    !loading &&
    !disabled &&
    (currentText.trim() || values.linkedinUrl || values.companyUrl || values.companyName);

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
    if (mode === "job_description") return;
    if (!isEnterKey(e.key, e.code) || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submitSearch();
  }

  function switchMode(newMode: NonNullable<ComposerValues["mode"]>) {
    onChange({ ...values, mode: newMode });
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
        <div role="tablist" aria-label="Search method" className="mb-3 flex gap-4 border-b border-lp-border">
          {(
            [
              ["describe", "Describe buyers"],
              ["job_description", "Paste job description"],
              ["linkedin", "LinkedIn profile"],
              ["company", "Company"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => switchMode(id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const next = (tabs.indexOf(mode) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
                switchMode(tabs[next]);
              }}
              className={cn(
                "border-b-2 px-1 pb-2 text-xs font-medium transition-colors",
                mode === id ? "border-lp-cold-blue text-lp-ice-blue" : "border-transparent text-lp-muted hover:text-lp-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "describe" && (
          <textarea
            rows={3}
            value={values.prompt}
            onChange={(e) => onChange({ ...values, prompt: e.target.value, mode: "describe" })}
            onKeyDown={handlePromptKeyDown}
            disabled={loading || disabled}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-lp-white placeholder:text-lp-muted-dark focus:outline-none disabled:opacity-50"
          />
        )}

        {mode === "job_description" && (
          <div className="space-y-2">
            <textarea
              rows={8}
              value={values.jobDescription ?? values.prompt}
              onChange={(e) => {
                const val = e.target.value;
                onChange({ ...values, jobDescription: val, prompt: val, mode: "job_description" });
              }}
              disabled={loading || disabled}
              placeholder="Paste job description here (up to 20,000 characters). We will extract the role, location, and key skills to find matching candidates..."
              className="w-full resize-y bg-transparent text-sm leading-relaxed text-lp-white placeholder:text-lp-muted-dark focus:outline-none disabled:opacity-50 min-h-[140px]"
            />
            <div className="flex justify-between text-[11px] text-lp-muted-dark">
              <span>Extracts role, seniority, location, and must-have/nice-to-have skills</span>
              <span>{((values.jobDescription ?? values.prompt)?.length ?? 0).toLocaleString()} / 20,000 chars</span>
            </div>
          </div>
        )}

        {mode === "linkedin" && (
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            value={values.linkedinUrl}
            onChange={(e) => onChange({ ...values, linkedinUrl: e.target.value, mode: "linkedin" })}
            disabled={loading || disabled}
            placeholder="LinkedIn profile link, e.g. linkedin.com/in/jane-doe"
            className="app-input"
          />
        )}

        {mode === "company" && (
          <div className="grid gap-2">
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              value={values.companyUrl}
              onChange={(e) => onChange({ ...values, companyUrl: e.target.value, mode: "company" })}
              disabled={loading || disabled}
              placeholder="Company website, e.g. stripe.com"
              className="app-input"
            />
            <input
              value={values.companyName}
              onChange={(e) => onChange({ ...values, companyName: e.target.value, mode: "company" })}
              disabled={loading || disabled}
              placeholder="Company name"
              className="app-input"
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {["Location", "Industry", "Company size", "Job title", "Seniority"].map((label) => (
            <button key={label} type="button" onClick={onOpenFilters} className="app-chip text-xs">
              {label}
            </button>
          ))}
        </div>
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
          {mode === "describe" && (
            <span className="hidden text-xs text-lp-muted-dark sm:inline">
              Enter to search · Shift+Enter for new line
            </span>
          )}
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
