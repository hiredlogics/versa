import { AdminApiKeysForm } from "@/components/admin/AdminApiKeysForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminApiKeysPage() {
  return (
    <div>
      <AdminPageHeader
        title="API keys"
        description="Manage platform provider credentials for Apollo and AI services."
      />
      <AdminApiKeysForm />
    </div>
  );
}
