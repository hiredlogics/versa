import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function AdminStatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "border-glass-border",
    success: "border-emerald-500/30",
    warning: "border-amber-500/30",
    danger: "border-red-500/30",
  };

  const content = (
  <div className={cn("glass-card p-4 transition-colors", tones[tone], href && "hover:border-electric/40")}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-off-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
