import { Shield } from "lucide-react";

export function SecurityBadge({ label }: { label: string }) {
  return (
    <p className="auth-security-badge">
      <Shield className="h-3 w-3" aria-hidden />
      {label}
    </p>
  );
}
