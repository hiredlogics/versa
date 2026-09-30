"use client";

import { usePathname } from "next/navigation";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNavbar } from "./MarketingNavbar";

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  const isHome = usePathname() === "/";
  if (isHome) return <main>{children}</main>;
  return <><MarketingNavbar /><main>{children}</main><MarketingFooter /></>;
}
