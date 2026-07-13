"use client";

import { useState, useEffect } from "react";
import { Save, CheckCircle2, AlertCircle, Key, Eye, EyeOff } from "lucide-react";

interface SettingsState {
  apolloKey: string;
  groqKey: string;
  openaiKey: string;
  apolloConfigured: boolean;
  aiConfigured: boolean;
  aiProvider: string;
  maskedApollo: string;
  maskedGroq: string;
  maskedOpenai: string;
}

export default function SettingsForm() {
  const [settings, setSettings] = useState<SettingsState>({
    apolloKey: "",
    groqKey: "",
    openaiKey: "",
    apolloConfigured: false,
    aiConfigured: false,
    aiProvider: "None",
    maskedApollo: "",
    maskedGroq: "",
    maskedOpenai: "",
  });
  const [showApollo, setShowApollo] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings((prev) => ({
        ...prev,
        apolloConfigured: data.status?.apollo || false,
        aiConfigured: data.status?.ai || false,
        aiProvider: data.status?.provider || "None",
        maskedApollo: data.masked?.apollo || "",
        maskedGroq: data.masked?.groq || "",
        maskedOpenai: data.masked?.openai || "",
      }));
    } catch {
      // ignore
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apolloKey: settings.apolloKey || undefined,
          groqKey: settings.groqKey || undefined,
          openaiKey: settings.openaiKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      setMessage({ type: "success", text: "API keys saved to .env.local successfully!" });
      setSettings((prev) => ({
        ...prev,
        apolloKey: "",
        groqKey: "",
        openaiKey: "",
        apolloConfigured: data.status?.apollo || prev.apolloConfigured,
        aiConfigured: data.status?.ai || prev.aiConfigured,
        aiProvider: data.status?.provider || prev.aiProvider,
      }));
      await fetchSettings();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Key className="w-4 h-4" />
            Apollo API Key
            {settings.apolloConfigured && (
              <span className="text-xs text-emerald-600 font-normal">✓ Configured</span>
            )}
          </label>
          {settings.apolloConfigured && settings.maskedApollo && !settings.apolloKey && (
            <p className="text-xs text-gray-500 mb-2">Current: {settings.maskedApollo}</p>
          )}
          <div className="relative">
            <input
              type={showApollo ? "text" : "password"}
              value={settings.apolloKey}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, apolloKey: e.target.value }))
              }
              placeholder={
                settings.apolloConfigured
                  ? "Enter new key to update..."
                  : "Enter your Apollo API key"
              }
              className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowApollo(!showApollo)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApollo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Get your key from{" "}
            <a
              href="https://app.apollo.io/#/settings/integrations/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              Apollo Settings → API
            </a>
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Key className="w-4 h-4" />
            Groq API Key
            {settings.aiConfigured && settings.aiProvider === "Groq" && (
              <span className="text-xs text-emerald-600 font-normal">✓ Active ({settings.aiProvider})</span>
            )}
          </label>
          {settings.maskedGroq && !settings.groqKey && (
            <p className="text-xs text-gray-500 mb-2">Current: {settings.maskedGroq}</p>
          )}
          <div className="relative">
            <input
              type={showGroq ? "text" : "password"}
              value={settings.groqKey}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, groqKey: e.target.value }))
              }
              placeholder="Enter your Groq API key (starts with gsk_)"
              className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowGroq(!showGroq)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showGroq ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Get your key from{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              Groq Console → API Keys
            </a>
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Key className="w-4 h-4" />
            OpenAI API Key <span className="text-xs font-normal text-gray-400">(optional)</span>
            {settings.aiConfigured && settings.aiProvider === "OpenAI" && (
              <span className="text-xs text-emerald-600 font-normal">✓ Active ({settings.aiProvider})</span>
            )}
          </label>
          {settings.maskedOpenai && !settings.openaiKey && (
            <p className="text-xs text-gray-500 mb-2">Current: {settings.maskedOpenai}</p>
          )}
          <div className="relative">
            <input
              type={showOpenai ? "text" : "password"}
              value={settings.openaiKey}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, openaiKey: e.target.value }))
              }
              placeholder="Enter your OpenAI API key (starts with sk-)"
              className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowOpenai(!showOpenai)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Get your key from{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              OpenAI Platform → API Keys
            </a>
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || (!settings.apolloKey && !settings.groqKey && !settings.openaiKey)}
        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save API Keys"}
      </button>

      <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Keys are saved to <code className="text-emerald-600">.env.local</code> on your machine.
          Searches pick them up immediately — no dev server restart needed.
        </p>
      </div>
    </form>
  );
}
