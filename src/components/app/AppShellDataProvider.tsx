"use client";

import { createContext, useContext } from "react";
import type { AppShellData } from "@/lib/app/shell-data";

const AppShellDataContext = createContext<AppShellData | null>(null);

export function AppShellDataProvider({
  initialData,
  children,
}: {
  initialData: AppShellData | null;
  children: React.ReactNode;
}) {
  return (
    <AppShellDataContext.Provider value={initialData}>{children}</AppShellDataContext.Provider>
  );
}

export function useAppShellData() {
  return useContext(AppShellDataContext);
}
