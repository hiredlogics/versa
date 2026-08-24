/**
 * The data provider returns both confirmed mailboxes and addresses built from a
 * company's known pattern. Only the first kind should be presented as verified.
 */
export type EmailConfidence = "verified" | "guessed" | "missing";

export function emailConfidence(
  email: string | null | undefined,
  status: string | null | undefined
): EmailConfidence {
  if (!email?.trim()) return "missing";
  const value = (status || "").trim().toLowerCase();
  if (!value) return "guessed";
  if (value === "verified" || value === "valid") return "verified";
  return "guessed";
}

export function isVerifiedEmail(
  email: string | null | undefined,
  status: string | null | undefined
): boolean {
  return emailConfidence(email, status) === "verified";
}

export function emailConfidenceLabel(confidence: EmailConfidence): string {
  if (confidence === "verified") return "Verified";
  if (confidence === "guessed") return "Likely";
  return "Missing";
}
