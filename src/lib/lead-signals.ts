/** Derive display signals from scoring reasoning + contact fields. */
export function deriveMatchSignals(lead: {
  reasoning: string | null;
  hasEmail: boolean;
  email: string | null;
  linkedinUrl: string | null;
}): string[] {
  const signals: string[] = [];

  if (lead.email || lead.hasEmail) {
    signals.push("Email verified");
  } else {
    signals.push("No email");
  }

  if (lead.linkedinUrl) {
    signals.push("LinkedIn profile");
  }

  // Only short score-style fragments become chips, skip prose "Why Reach Out" paragraphs
  if (lead.reasoning?.trim() && lead.reasoning.length < 160) {
    for (const part of lead.reasoning.split(/\.\s+/).map((s) => s.trim()).filter(Boolean)) {
      const normalized = part.replace(/\.$/, "");
      const lower = normalized.toLowerCase();
      if (normalized.length > 48) continue;
      if (lower.includes("email available") || lower.includes("email verified")) continue;
      if (!signals.includes(normalized)) signals.push(normalized);
    }
  }

  return signals;
}

export type SignalTone = "success" | "warning" | "info" | "neutral";

export function signalTone(signal: string): SignalTone {
  const lower = signal.toLowerCase();
  if (lower.includes("no email")) return "warning";
  if (lower.includes("email")) return "success";
  if (lower.includes("linkedin")) return "info";
  if (lower.includes("decision") || lower.includes("authority") || lower.includes("intent")) {
    return "success";
  }
  if (lower.includes("match") || lower.includes("ideal") || lower.includes("relevant")) {
    return "info";
  }
  return "neutral";
}
