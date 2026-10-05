/**
 * Formats a skill match summary, e.g. "8/10 · Has Spark, AWS · No sign of Airflow".
 * Returns null when both lists are empty. Safe to use in client components.
 */
export function formatSkillsBreakdown(
  leadScore: number,
  matchedSkills?: string[] | null,
  missingSkills?: string[] | null
): string | null {
  const matched = (matchedSkills ?? []).map((s) => s.trim()).filter(Boolean);
  const missing = (missingSkills ?? []).map((s) => s.trim()).filter(Boolean);
  if (matched.length === 0 && missing.length === 0) return null;

  const parts = [`${leadScore}/10`];
  if (matched.length > 0) parts.push(`Has ${matched.join(", ")}`);
  if (missing.length > 0) parts.push(`No sign of ${missing.join(", ")}`);
  return parts.join(" · ");
}
