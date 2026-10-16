import type { SearchCriteria } from "@/lib/types";

/** Normalize titles so `Data Engineers`, `data-engineer`, and `Data Engineer` compare equally. */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/front[\s-]?end/g, "frontend")
    .replace(/back[\s-]?end/g, "backend")
    .replace(/full[\s-]?stack/g, "fullstack")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ");
}

/**
 * Extract the role directly requested by the user. We deliberately use the
 * prompt rather than AI-generated title alternatives, so `Data Scientist` is
 * never accepted for a request that explicitly says `Data Engineer`.
 */
export function requestedRoleFromPrompt(prompt: string): string | null {
  const match = prompt.match(
    /(?:\bfind\b|\bwant\b|\bneed\b|\blooking for\b|\bshow me\b|\bgive me\b)\s+(?:up to\s+)?(?:\d+\s+)?(?:leads?\s+(?:of|for)\s+)?(.+?)(?=\s+(?:in|from|at|within|located in|based in)\b|$)/i
  );
  // The product also accepts concise prompts such as "Flask Developer in
  // Chicago, IL"; there is no leading "find"/"want" verb in that form.
  const directMatch = prompt.match(
    /^\s*(?:\d+\s+)?(.+?)(?=\s+(?:in|from|at|within|located in|based in)\b)/i
  );
  const requested = match?.[1] ?? directMatch?.[1];
  if (!requested) return null;

  const role = normalizeTitle(requested
    .replace(/^(?:i\s+)?(?:have\s+to\s+)?/, "")
    .replace(/\bleads?\b/gi, "")
    .trim());
  return role.split(" ").length >= 2 ? role : null;
}

export function titleMatchesRequestedRole(title: string, prompt: string): boolean {
  const requested = requestedRoleFromPrompt(prompt);
  if (!requested) return true;
  return normalizeTitle(title).includes(requested);
}

export function filterByRequestedRole<T extends { title: string }>(people: T[], prompt: string): T[] {
  return people.filter((person) => titleMatchesRequestedRole(person.title, prompt));
}

/** Apply the LLM-selected Apollo title set to cached and provider results. */
export function filterByLlmTitles<T extends { title: string }>(people: T[], titles: string[]): T[] {
  const allowed = titles.map(normalizeTitle).filter(Boolean);
  if (!allowed.length) return people;
  return people.filter((person) => {
    const candidate = normalizeTitle(person.title);
    return allowed.some((title) => candidate.includes(title) || title.includes(candidate));
  });
}

function displayTitle(normalizedTitle: string): string {
  return normalizedTitle
    .split(" ")
    .map((word) => (word === "ui" || word === "ux" ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

function promptRequestsCompanySize(prompt: string): boolean {
  return /\b\d+\s*(?:-|to|–)\s*\d+\s*(?:employees?|people|staff)|\b(?:startup|small|mid-?size|enterprise)\b/i.test(
    prompt
  );
}

function promptRequestsTechnologyIndustry(prompt: string): boolean {
  return /\b(?:technology|tech|software|saas|it companies?)\b/i.test(prompt);
}

/**
 * When the user explicitly names a job role, do not let Apollo expand it to
 * neighbouring occupations. This applies to every role phrase, not a hardcoded
 * catalogue of titles.
 */
export function applyStrictRequestedRole(criteria: SearchCriteria, prompt: string): SearchCriteria {
  const requested = requestedRoleFromPrompt(prompt);
  if (!requested || !criteria.apollo) return criteria;

  const exactTitles = criteria.apollo.personTitles.filter((title) =>
    normalizeTitle(title).includes(requested)
  );
  const personTitles = exactTitles.length > 0 ? exactTitles : [displayTitle(requested)];
  const removeDefaultTechnologyFilter =
    criteria.industry.trim().toLowerCase() === "technology" && !promptRequestsTechnologyIndustry(prompt);

  return {
    ...criteria,
    industry: removeDefaultTechnologyFilter ? "Any" : criteria.industry,
    jobTitles: personTitles,
    apollo: {
      ...criteria.apollo,
      personTitles,
      includeSimilarTitles: false,
      // A role + location prompt must search people, not only companies whose
      // names match the AI's default "Technology" label or a default 11-500
      // employee band. Retain these filters only when the user asked for them.
      qKeywords: removeDefaultTechnologyFilter ? undefined : criteria.apollo.qKeywords,
      employeeRanges: promptRequestsCompanySize(prompt)
        ? criteria.apollo.employeeRanges
        : undefined,
    },
  };
}
