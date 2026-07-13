"use client";

export function UseCasesProductVisual() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--varsa-editorial-border)] bg-[var(--varsa-editorial-surface)] p-6 shadow-2xl"
      aria-hidden
    >
      <div className="space-y-3">
        <div className="h-3 w-24 rounded-full bg-[var(--varsa-editorial-border)]" />
        <div className="rounded-xl border border-[var(--varsa-editorial-border)] bg-[var(--varsa-editorial-bg)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--varsa-editorial-muted)]">
            Lead search
          </p>
          <p className="mt-2 text-sm text-[var(--varsa-editorial-text)]">
            VP Engineering at AI healthcare startups in the US
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {["92", "88", "85", "81"].map((score) => (
            <div
              key={score}
              className="rounded-lg border border-[var(--varsa-editorial-border)] bg-[var(--varsa-editorial-bg)] px-3 py-2"
            >
              <p className="text-[10px] text-[var(--varsa-editorial-muted)]">Match score</p>
              <p className="text-lg font-semibold text-[var(--varsa-editorial-text)]">{score}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
