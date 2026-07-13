import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function SettingsSectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "overflow-hidden rounded-2xl border border-lp-border bg-lp-panel/30 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        className
      )}
    >
      <div className="border-b border-lp-border bg-gradient-to-r from-lp-panel/80 to-transparent px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-lp-border-strong bg-lp-panel-strong shadow-sm">
            <Icon className="h-5 w-5 text-lp-ice-blue" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-lp-white">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-lp-muted">{description}</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}
