"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Key, Save } from "lucide-react";

type KeyField = "apolloKey" | "groqKey" | "openaiKey";

export function AdminApiKeysForm() {
  const [apolloKey, setApolloKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [apolloConfigured, setApolloConfigured] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiProvider, setAiProvider] = useState("None");
  const [maskedApollo, setMaskedApollo] = useState("");
  const [maskedGroq, setMaskedGroq] = useState("");
  const [maskedOpenai, setMaskedOpenai] = useState("");
  const [show, setShow] = useState<Record<KeyField, boolean>>({
    apolloKey: false,
    groqKey: false,
    openaiKey: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/admin/api-keys");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load API keys");
    setApolloConfigured(Boolean(data.status?.apollo));
    setAiConfigured(Boolean(data.status?.ai));
    setAiProvider(data.status?.provider || "None");
    setMaskedApollo(data.masked?.apollo || "");
    setMaskedGroq(data.masked?.groq || "");
    setMaskedOpenai(data.masked?.openai || "");
  }

  useEffect(() => {
    loadStatus()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apolloKey && !groqKey && !openaiKey) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apolloKey: apolloKey || undefined,
          groqKey: groqKey || undefined,
          openaiKey: openaiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setApolloKey("");
      setGroqKey("");
      setOpenaiKey("");
      setApolloConfigured(Boolean(data.status?.apollo));
      setAiConfigured(Boolean(data.status?.ai));
      setAiProvider(data.status?.provider || "None");
      await loadStatus();
      setMessage("Keys saved to .env.local. Active immediately for new searches.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function renderField(
    id: KeyField,
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    hint: string,
    configured?: boolean,
    masked?: string
  ) {
    return (
      <div className="glass-card p-4 space-y-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-off-white">
          <Key className="h-4 w-4 text-electric" />
          {label}
          {configured && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Configured
            </span>
          )}
        </label>
        {masked && !value && <p className="text-xs text-muted">Current: {masked}</p>}
        <div className="relative">
          <input
            id={id}
            type={show[id] ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full rounded-lg border border-glass-border bg-charcoal-light px-3 py-2 pr-10 text-sm text-off-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-electric/40"
          />
          <button
            type="button"
            onClick={() => setShow((prev) => ({ ...prev, [id]: !prev[id] }))}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white"
            aria-label={show[id] ? "Hide key" : "Show key"}
          >
            {show[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    );
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-charcoal-card" />;
  }

  const canSave = Boolean(apolloKey || groqKey || openaiKey);

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      <p className="text-sm text-muted">
        Platform credentials for Apollo lead search and AI parsing. Stored in{" "}
        <code className="text-electric">.env.local</code> on the server — never exposed to end users.
      </p>

      {!apolloConfigured && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Apollo is not configured. Lead searches will fail until you save a key below.
        </p>
      )}

      {message && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {renderField(
          "apolloKey",
          "Apollo API key",
          apolloKey,
          setApolloKey,
          apolloConfigured ? "Enter new key to update…" : "Paste Apollo API key",
          "Required for lead search — Apollo → Settings → Integrations → API",
          apolloConfigured,
          maskedApollo
        )}
        {renderField(
          "groqKey",
          "Groq API key",
          groqKey,
          setGroqKey,
          "gsk_…",
          aiProvider === "Groq" ? "Active AI provider" : "Optional — fast prompt parsing",
          aiConfigured && aiProvider === "Groq",
          maskedGroq
        )}
        {renderField(
          "openaiKey",
          "OpenAI API key",
          openaiKey,
          setOpenaiKey,
          "sk-…",
          aiProvider === "OpenAI" ? "Active AI provider" : "Optional fallback",
          aiConfigured && aiProvider === "OpenAI",
          maskedOpenai
        )}
      </div>

      <button
        type="submit"
        disabled={!canSave || saving}
        className="inline-flex items-center gap-2 rounded-lg bg-electric px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving…" : "Save API keys"}
      </button>
    </form>
  );
}
