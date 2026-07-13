"use client";

import { cn } from "@/lib/utils/cn";

export function TagInput({
  label,
  values,
  onChange,
  suggestions,
  placeholder = "Type and press Enter",
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
      <span className="text-sm font-medium text-[#111111]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => remove(v)}
            className="settings-tag"
          >
            {v}
            <span aria-hidden>×</span>
          </button>
        ))}
      </div>
      <input
        className="settings-input"
        placeholder={placeholder}
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
                "rounded-full border border-black/[0.08] bg-[#F6F7F9] px-2.5 py-1 text-xs text-[#6F6F6F] transition-colors hover:border-[#2563EB]/30 hover:text-[#2563EB]"
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
