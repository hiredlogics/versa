"use client";

export function CompanySizeRange({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Min employees</span>
        <input
          type="number"
          min={1}
          className="app-input"
          value={min}
          onChange={(e) => onChange(Number(e.target.value) || 1, max)}
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-lp-muted">Max employees</span>
        <input
          type="number"
          min={1}
          className="app-input"
          value={max}
          onChange={(e) => onChange(min, Number(e.target.value) || 500)}
        />
      </label>
    </div>
  );
}
