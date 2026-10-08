import { redirect } from "next/navigation";

/** Legacy route: API keys are server-side only; settings live under /app/settings */
export default function LegacySettingsPage() {
  redirect("/app/settings");
}
