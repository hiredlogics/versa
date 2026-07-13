import { cn } from "@/lib/utils/cn";

const colors = {
  default: "bg-white/10 text-off-white",
  blue: "bg-electric/20 text-blue-300",
  violet: "bg-violet/20 text-violet-300",
  emerald: "bg-emerald/20 text-emerald-300",
  high: "bg-emerald/20 text-emerald-300",
};

export function Badge({
  children,
  color = "default",
  className,
}: {
  children: React.ReactNode;
  color?: keyof typeof colors;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 9 ? "high" : score >= 8 ? "blue" : ("default" as keyof typeof colors);
  return (
    <Badge color={color} className="border border-lp-border bg-lp-panel text-lp-ice-blue">
      {score}/10
    </Badge>
  );
}

export function SearchStatusBadge({ status }: { status: string }) {
  const map: Record<string, keyof typeof colors> = {
    COMPLETE: "emerald",
    RUNNING: "blue",
    FAILED: "violet",
    PENDING: "default",
  };
  return <Badge color={map[status] || "default"}>{status}</Badge>;
}
