import { cn } from "@/lib/utils/cn";

const SIGNAL_DOTS = [
  { top: "18%", left: "10%" },
  { top: "34%", left: "28%" },
  { top: "52%", left: "46%" },
  { top: "68%", left: "64%" },
  { top: "82%", left: "82%" },
] as const;

export function VersaBackground({
  className,
  variant = "default",
  showScanline = false,
  fixed = true,
}: {
  className?: string;
  variant?: "default" | "subtle" | "auth";
  showScanline?: boolean;
  fixed?: boolean;
}) {
  const spotlightOpacity =
    variant === "subtle" ? "rgba(187, 215, 255, 0.06)" : "rgba(187, 215, 255, 0.09)";

  return (
    <div
      className={cn(
        "versa-background versa-motion overflow-hidden",
        fixed ? "fixed inset-0" : "absolute inset-0",
        className
      )}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 55% 45% at 50% -5%, ${spotlightOpacity}, transparent 68%)`,
        }}
      />
      <div
        className={cn(
          "versa-aurora-a absolute -top-1/3 left-1/4 h-[500px] w-[500px] rounded-full blur-[120px]",
          variant === "auth" ? "bg-lp-ice-blue/[0.07]" : "bg-lp-ice-blue/[0.05]"
        )}
      />
      <div className="versa-aurora-b absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-white/[0.04] blur-[100px]" />
      {variant === "auth" && (
        <div className="absolute top-1/4 right-0 h-[420px] w-[420px] rounded-full bg-lp-cold-blue/[0.05] blur-[100px]" />
      )}
      <div className="versa-grid absolute inset-0" />
      <div className="versa-noise absolute inset-0" />
      {SIGNAL_DOTS.map((dot, i) => (
        <span
          key={i}
          className="versa-signal-dot absolute h-1 w-1 rounded-full bg-lp-ice-blue/35"
          style={{ top: dot.top, left: dot.left }}
        />
      ))}
      {showScanline && (
        <div className="absolute inset-x-0 top-1/3 h-px overflow-hidden">
          <div className="versa-scanline h-full w-1/3 bg-gradient-to-r from-transparent via-lp-cold-blue/25 to-transparent" />
        </div>
      )}
    </div>
  );
}
