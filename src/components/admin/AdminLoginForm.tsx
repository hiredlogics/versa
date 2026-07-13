"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shield } from "lucide-react";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/Button";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-glass-border bg-charcoal-card p-8 shadow-xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15">
          <Shield className="h-5 w-5 text-electric" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-off-white">Admin sign in</h1>
          <p className="text-sm text-muted">Static admin credentials only</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="admin-email" className="text-sm font-medium text-off-white">
            Admin email
          </label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-glass-border bg-charcoal-light px-3 py-2.5 text-sm text-off-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-electric/40"
            placeholder="hiredlogic@gmail.com"
          />
        </div>

        <PasswordInput
          id="admin-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          placeholder="Admin password"
        />

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in to admin"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Separate from user login. Only configured admin emails can access the console.
      </p>
    </div>
  );
}
