import type { UserLeadContextDTO } from "@/lib/validations/onboarding-context";

export function titleMatchesExcluded(title: string, excludedTitles: string[]): boolean {
  const t = title.toLowerCase();
  return excludedTitles.some((ex) => {
    const e = ex.toLowerCase().trim();
    if (!e) return false;
    return t.includes(e) || e.includes(t);
  });
}

export function industryMatchesExcluded(industry: string, excludedIndustries: string[]): boolean {
  const i = industry.toLowerCase();
  return excludedIndustries.some((ex) => {
    const e = ex.toLowerCase().trim();
    if (!e) return false;
    return i.includes(e) || e.includes(i);
  });
}

export function promptExplicitlyRequestsTitle(
  prompt: string,
  title: string,
  excludedTitles: string[]
): boolean {
  const p = prompt.toLowerCase();
  const t = title.toLowerCase();
  if (p.includes(t)) return true;
  return excludedTitles.some((ex) => {
    const e = ex.toLowerCase();
    return p.includes(e);
  });
}

export function applyExclusionScoreCap(
  score: number,
  lead: { title: string; industry: string },
  excludedTitles: string[],
  excludedIndustries: string[],
  originalPrompt: string
): number {
  let capped = score;
  if (
    excludedTitles.length > 0 &&
    titleMatchesExcluded(lead.title, excludedTitles) &&
    !promptExplicitlyRequestsTitle(originalPrompt, lead.title, excludedTitles)
  ) {
    capped = Math.min(capped, 5);
  }
  if (excludedIndustries.length > 0 && industryMatchesExcluded(lead.industry, excludedIndustries)) {
    capped = Math.min(capped, 5);
  }
  return capped;
}

export function filterExcludedLeads<
  T extends { title: string; industry?: string | null; organization?: { industry?: string } }
>(
  people: T[],
  excludedTitles: string[],
  excludedIndustries: string[],
  originalPrompt: string
): T[] {
  if (!excludedTitles.length && !excludedIndustries.length) return people;

  return people.filter((p) => {
    const industry =
      (p as { industry?: string }).industry ??
      p.organization?.industry ??
      "";
    const title = (p as { title?: string }).title ?? "";
    if (
      excludedTitles.length > 0 &&
      titleMatchesExcluded(title, excludedTitles) &&
      !promptExplicitlyRequestsTitle(originalPrompt, title, excludedTitles)
    ) {
      return false;
    }
    if (
      excludedIndustries.length > 0 &&
      industry &&
      industryMatchesExcluded(industry, excludedIndustries)
    ) {
      return false;
    }
    return true;
  });
}

export function buildScoringContextFromLeadContext(
  ctx: UserLeadContextDTO | null,
  parsed: {
    searchIntent?: string;
    keywords?: string;
    excludedTitles?: string[];
    excludedIndustries?: string[];
  },
  originalPrompt: string
): import("@/lib/types").LeadScoreContext {
  return {
    searchIntent: parsed.searchIntent,
    keywords: parsed.keywords,
    originalPrompt,
    leadContext: ctx,
    excludedTitles: parsed.excludedTitles ?? ctx?.excludedTitles ?? [],
    excludedIndustries: parsed.excludedIndustries ?? ctx?.excludedIndustries ?? [],
  };
}
