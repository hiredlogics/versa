"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ClarificationQuestion } from "@/lib/clarifyPrompt";

export interface ClarificationAnswer {
  /** Follow-up prompt text sent as the user's next chat turn. */
  text: string;
  requestedLeadCount?: number;
}

function parseCount(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function OptionChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        selected
          ? "inline-flex items-center gap-1.5 rounded-full border border-lp-cold-blue/60 bg-lp-cold-blue/15 px-3 py-1.5 text-xs font-medium text-lp-white transition-colors"
          : "inline-flex items-center gap-1.5 rounded-full border border-lp-border bg-lp-panel px-3 py-1.5 text-xs text-lp-muted transition-colors hover:border-lp-border-strong hover:text-lp-off-white"
      }
    >
      {selected && <Check className="h-3 w-3" aria-hidden />}
      {label}
    </button>
  );
}

export function ClarificationCard({
  questions,
  leadsRemaining,
  batchSize = 100,
  disabled,
  onSubmit,
}: {
  questions: ClarificationQuestion[];
  leadsRemaining?: number;
  batchSize?: number;
  disabled?: boolean;
  onSubmit: (answer: ClarificationAnswer) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});

  function toggle(question: ClarificationQuestion, option: string) {
    setSelected((prev) => {
      const current = prev[question.id] ?? [];
      if (current.includes(option)) {
        return { ...prev, [question.id]: current.filter((v) => v !== option) };
      }
      return {
        ...prev,
        [question.id]: question.allowMultiple ? [...current, option] : [option],
      };
    });
  }

  const answers = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const question of questions) {
      const values = [...(selected[question.id] ?? [])];
      const typed = (custom[question.id] ?? "").trim();
      if (typed) values.push(typed);
      if (values.length > 0) map[question.id] = values;
    }
    return map;
  }, [questions, selected, custom]);

  const answeredAll = questions.every((q) => (answers[q.id]?.length ?? 0) > 0);
  const requestedLeadCount = answers.count?.length ? parseCount(answers.count[0]) : undefined;
  const cappedCount =
    requestedLeadCount != null && typeof leadsRemaining === "number"
      ? Math.min(requestedLeadCount, leadsRemaining)
      : requestedLeadCount;

  function submit() {
    const parts: string[] = [];
    if (answers.roles?.length) parts.push(answers.roles.join(", "));
    if (answers.location?.length) parts.push(`in ${answers.location.join(", ")}`);
    if (requestedLeadCount) parts.push(`— ${requestedLeadCount} leads`);

    const text = parts.join(" ").trim();
    onSubmit({ text: text || "Use my answers above", requestedLeadCount });
  }

  return (
    <div className="max-w-[92%] rounded-xl border border-lp-cold-blue/25 bg-lp-cold-blue/[0.04] p-4 sm:max-w-[85%]">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-lp-cold-blue" aria-hidden />
        <p className="text-[11px] font-medium uppercase tracking-wider text-lp-muted-dark">
          Quick questions
        </p>
      </div>

      <div className="space-y-5">
        {questions.map((question) => (
          <div key={question.id}>
            <p className="mb-2 text-sm font-medium text-lp-off-white">{question.prompt}</p>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => (
                <OptionChip
                  key={option}
                  label={option}
                  selected={(selected[question.id] ?? []).includes(option)}
                  onClick={() => toggle(question, option)}
                />
              ))}
            </div>
            {question.customPlaceholder && (
              <input
                value={custom[question.id] ?? ""}
                onChange={(e) =>
                  setCustom((prev) => ({ ...prev, [question.id]: e.target.value }))
                }
                placeholder={question.customPlaceholder}
                inputMode={question.id === "count" ? "numeric" : "text"}
                className="app-input mt-2 w-full py-1.5 text-xs sm:max-w-xs"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={submit} disabled={disabled || !answeredAll}>
          Find leads
        </Button>
        {!answeredAll && (
          <p className="text-xs text-lp-muted-dark">Pick or type an answer for each question.</p>
        )}
        {answeredAll && (
          <p className="text-xs text-lp-muted">
            {cappedCount
              ? `We'll unlock the first ${Math.min(cappedCount, batchSize)} now, then offer the next ${batchSize}.`
              : `We'll unlock the first ${batchSize} now, then offer the next ${batchSize}.`}
            {typeof leadsRemaining === "number"
              ? ` ${leadsRemaining.toLocaleString()} credits left.`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}
