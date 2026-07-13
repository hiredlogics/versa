import { AppProviders } from "@/components/providers/AppProviders";
import { AppLayoutClient } from "@/components/app/AppLayoutClient";
import { AppShellDataProvider } from "@/components/app/AppShellDataProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getAppShellData } from "@/lib/app/shell-data";
import "../globals.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const shellData = user ? await getAppShellData(user.id, user.role === "ADMIN") : null;

  return (
    <AppProviders>
      <AppShellDataProvider initialData={shellData}>
        <AppLayoutClient>{children}</AppLayoutClient>
      </AppShellDataProvider>
    </AppProviders>
  );
}
