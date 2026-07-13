export const SETTINGS_TABS = [
  { id: "lead-context", label: "Lead Context" },
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "billing", label: "Billing" },
  { id: "preferences", label: "Preferences" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export function isSettingsTabId(value: string | null): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
