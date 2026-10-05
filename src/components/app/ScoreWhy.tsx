"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { ScoreBadge } from "@/components/ui/Badge";

const PANEL_WIDTH = 288;

/**
 * The score badge; hover (or tap) shows the points for and against that score.
 * The panel is fixed-positioned so scrolling tables never clip it.
 */
export function ScoreWhy({
  score,
  pros = [],
  cons = [],
  reasoning,
}: {
  score: number;
  pros?: string[];
  cons?: string[];
  reasoning?: string | null;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const pinned = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const open = position !== null;

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8);
    setPosition({ top: rect.bottom + 6, left });
  }

  function hide() {
    pinned.current = false;
    setPosition(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const onPointer = (e: PointerEvent) => {
      if (!buttonRef.current?.contains(e.target as Node)) hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open]);

  const hasPoints = pros.length > 0 || cons.length > 0;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        aria-label={`Score ${score} out of 10. Show why.`}
        onMouseEnter={show}
        onMouseLeave={() => !pinned.current && hide()}
        onFocus={show}
        onBlur={() => !pinned.current && hide()}
        onClick={(e) => {
          e.stopPropagation();
          pinned.current = !pinned.current;
          if (pinned.current) show();
          else hide();
        }}
        className="cursor-help rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-ice-blue/50"
      >
        <ScoreBadge score={score} />
      </button>

      {position && (
        <div
          id={panelId}
          role="tooltip"
          style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
          className="fixed z-50 space-y-2.5 rounded-xl border border-lp-border bg-lp-panel-strong p-3.5 text-left shadow-2xl"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-lp-muted-dark">
            Why {score}/10
          </p>
          {hasPoints ? (
            <ScorePoints pros={pros} cons={cons} />
          ) : (
            <p className="text-xs leading-relaxed text-lp-muted">
              {reasoning || "No details were saved for this score. Newer searches show them."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Green ticks for what raised the score, red crosses for what held it back. */
export function ScorePoints({ pros = [], cons = [] }: { pros?: string[]; cons?: string[] }) {
  return (
    <>
      <PointList items={pros} good />
      <PointList items={cons} />
    </>
  );
}

function PointList({ items, good = false }: { items: string[]; good?: boolean }) {
  if (items.length === 0) return null;
  const Icon = good ? Check : X;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-1.5 text-xs leading-snug text-lp-off-white">
          <Icon
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${good ? "text-emerald-300" : "text-rose-300"}`}
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
