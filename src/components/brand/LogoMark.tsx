import { cn } from "@/lib/utils/cn";

const SIZE_MAP = {
  sm: 26,
  md: 36,
  lg: 44,
} as const;

export type LogoMarkSize = keyof typeof SIZE_MAP;

/** Cursor-style rounded square app icon with isometric 3D cube */
export function LogoMark({
  className,
  size = "md",
  animated = true,
}: {
  className?: string;
  size?: LogoMarkSize | number;
  animated?: boolean;
}) {
  const px = typeof size === "number" ? size : SIZE_MAP[size];
  const animClass = animated ? "versa-logo--animated" : "";

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("varsa-mark versa-logo-mark shrink-0", animClass, className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="varsa-cube-top" x1="16" y1="8" x2="16" y2="17.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#F4F4F5" />
          <stop offset="100%" stopColor="#BBD7FF" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="varsa-cube-top-glow" cx="16" cy="12.5" r="5.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7FB3FF" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#BBD7FF" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="varsa-cube-left" x1="8" y1="12" x2="16" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#08080A" />
          <stop offset="100%" stopColor="#030303" />
        </linearGradient>
        <linearGradient id="varsa-cube-right" x1="24" y1="12" x2="16" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#101014" />
          <stop offset="100%" stopColor="#08080A" />
        </linearGradient>
        <radialGradient id="varsa-node-core" cx="16" cy="12.5" r="1.2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#BBD7FF" />
          <stop offset="100%" stopColor="#7FB3FF" />
        </radialGradient>
      </defs>

      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="9"
        fill="#FFFFFF"
        stroke="currentColor"
        strokeWidth="0.75"
        className="varsa-icon-shell"
      />

      <g className="varsa-cube-3d">
        <path
          d="M16 8 L23.8 12.1 L16 17.5 L8.2 12.1 Z"
          fill="url(#varsa-cube-top)"
          stroke="currentColor"
          strokeWidth="0.5"
          className="varsa-cube-top"
        />
        <path
          d="M16 8 L23.8 12.1 L16 17.5 L8.2 12.1 Z"
          fill="url(#varsa-cube-top-glow)"
          className="varsa-cube-top-glow"
        />
        <path
          d="M8.2 12.1 L16 17.5 L16 23.8 L8.2 19.2 Z"
          fill="url(#varsa-cube-left)"
          className="varsa-cube-left"
        />
        <path
          d="M16 17.5 L23.8 12.1 L23.8 19.2 L16 23.8 Z"
          fill="url(#varsa-cube-right)"
          className="varsa-cube-right"
        />

        <path
          d="M16 8 L23.8 12.1"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeLinecap="round"
          className="varsa-cube-edge"
          opacity="0.6"
        />
        <path
          d="M16 8 L8.2 12.1"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeLinecap="round"
          className="varsa-cube-edge"
          opacity="0.38"
        />
        <path
          d="M23.8 12.1 L23.8 19.2 L16 23.8 L8.2 19.2 L8.2 12.1"
          stroke="currentColor"
          strokeWidth="0.55"
          strokeLinejoin="round"
          fill="none"
          className="varsa-cube-outline"
          opacity="0.38"
        />

        <circle cx="16" cy="12.5" r="1.85" className="versa-node versa-node-ring" fill="currentColor" />
        <circle cx="16" cy="12.5" r="0.95" className="versa-node-core" fill="url(#varsa-node-core)" />
      </g>
    </svg>
  );
}
