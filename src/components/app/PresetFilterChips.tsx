"use client";

import { cn } from "@/lib/utils/cn";

const PRESETS = [
  "SaaS founders",
  "AI startups",
  "Healthcare CTOs",
  "Agency owners",
  "VP Engineering",
  "US companies",
  "10 to 500 employees",
  "Need automation",
];

export function PresetFilterChips({
  onSelect,
  disabled,
}: {
  onSelect: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((chip) => (
        <button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip)}
          className={cn("app-chip disabled:cursor-not-allowed disabled:opacity-40")}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
