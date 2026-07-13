"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import { contactSchema, type ContactInput } from "@/lib/contact/validation";

const TEAM_SIZES = ["1-5", "6-20", "21-50", "51-200", "200+"] as const;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-lp-muted">{label}</label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-400/90" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "lp-input w-full rounded-xl border border-lp-border bg-lp-panel px-4 py-3 text-sm text-lp-white placeholder:text-lp-muted-dark transition-all focus:border-lp-ice-blue/50 focus:shadow-[0_0_0_3px_rgba(187,215,255,0.08)] focus:outline-none";

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ContactInput, string>>>({});

  const [form, setForm] = useState<ContactInput>({
    email: "",
    name: "",
    company: "",
    teamSize: "1-5",
    intent: "",
    message: "",
  });

  function update<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSuccess(false);

    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Partial<Record<keyof ContactInput, string>> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof ContactInput;
        if (!errors[key]) errors[key] = issue.message;
      });
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong. Please try again.");
        if (data.issues) setFieldErrors(data.issues);
        return;
      }

      setSuccess(true);
      setForm({ email: "", name: "", company: "", teamSize: "1-5", intent: "", message: "" });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <motion.div
        className="lp-glass-panel rounded-2xl border border-lp-border-strong p-8 text-center"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <CheckCircle2 className="mx-auto h-10 w-10 text-lp-success mb-4" />
        <h3 className="text-lg font-semibold text-lp-white">Message received</h3>
        <p className="mt-2 text-sm text-lp-muted">
          Thanks for reaching out. Our team will respond within one business day.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="mt-6 text-sm text-lp-ice-blue hover:underline"
        >
          Send another message
        </button>
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      noValidate
      className="lp-glass-panel rounded-2xl border border-lp-border p-6 md:p-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Work email" error={fieldErrors.email}>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Name" error={fieldErrors.name}>
          <input
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Company" error={fieldErrors.company}>
          <input
            type="text"
            autoComplete="organization"
            placeholder="Company name"
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Team size" error={fieldErrors.teamSize}>
          <select
            value={form.teamSize}
            onChange={(e) => update("teamSize", e.target.value as ContactInput["teamSize"])}
            className={inputClass}
          >
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s} className="bg-lp-charcoal">
                {s} people
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="What are you trying to find?" error={fieldErrors.intent}>
          <textarea
            rows={3}
            placeholder="e.g. SaaS founders in the US with 20–300 employees who need AI automation"
            value={form.intent}
            onChange={(e) => update("intent", e.target.value)}
            className={`${inputClass} min-h-[88px] resize-y`}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Message (optional)" error={fieldErrors.message}>
          <textarea
            rows={3}
            placeholder="Anything else we should know?"
            value={form.message ?? ""}
            onChange={(e) => update("message", e.target.value)}
            className={`${inputClass} min-h-[80px] resize-y`}
          />
        </Field>
      </div>

      {formError && (
        <p className="mt-4 text-center text-xs text-red-400/90" role="alert">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="lp-btn-primary mt-6 flex w-full items-center justify-center gap-2 btn-lift"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {loading ? "Sending…" : "Send message"}
      </button>
    </motion.form>
  );
}
