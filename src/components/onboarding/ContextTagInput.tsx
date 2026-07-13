"use client";

import { cn } from "@/lib/utils/cn";

export function ContextTagInput({
  label,
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  function add(value: string) {
    const t = value.trim();
    if (!t) return;
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...values, t]);
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-lp-muted">{label}</label>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => remove(v)}
            className="app-chip text-lp-ice-blue"
          >
            {v} ×
          </button>
        ))}
      </div>
      <input
        className="app-input"
        placeholder={placeholder ?? "Type and press Enter"}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
      />
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn(
                "rounded-full border border-lp-border px-2.5 py-1 text-[11px] text-lp-muted transition-colors hover:border-lp-border-strong hover:text-lp-off-white",
                values.some((v) => v.toLowerCase() === s.toLowerCase()) && "opacity-40"
              )}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
