import { GlassCard } from "@/components/ui/Card";

export default function ApiKeysPage() {
  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">API Keys (BYOK)</h1>
      <GlassCard>
        <p className="text-sm text-muted">
          Using your own API keys is available on Pro and Agency plans. By default, VARSA manages the keys for you.
          Contact support to enable encrypted key storage for your account.
        </p>
      </GlassCard>
    </div>
  );
}
