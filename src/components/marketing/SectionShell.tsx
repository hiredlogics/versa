import { cn } from "@/lib/utils/cn";
import { FadeIn } from "./AnimatedAurora";

export function SectionShell({
  id,
  children,
  className,
  soft = false,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  soft?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative px-4 py-14 md:py-20",
        soft ? "bg-lp-graphite" : "bg-lp-black",
        className
      )}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeader({
  badge,
  title,
  subtitle,
  align = "center",
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  return (
    <FadeIn className={cn("mb-10 md:mb-12", align === "center" && "text-center max-w-3xl mx-auto")}>
      {badge && (
        <p className="mb-4 inline-flex items-center rounded-full border border-lp-border bg-lp-panel px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-lp-muted">
          {badge}
        </p>
      )}
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-lp-white">{title}</h2>
      {subtitle && <p className="mt-4 text-base md:text-lg text-lp-muted leading-relaxed">{subtitle}</p>}
    </FadeIn>
  );
}
