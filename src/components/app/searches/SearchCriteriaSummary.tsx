"use client";

export function SearchCriteriaSummary({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-lp-border bg-lp-panel px-2.5 py-0.5 text-[11px] text-lp-muted"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
