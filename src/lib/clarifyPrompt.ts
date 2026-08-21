import type { SearchCriteria } from "@/lib/types";

export type ClarificationQuestionId = "location" | "roles" | "count";

export type ClarificationQuestion = {
  id: ClarificationQuestionId;
  /** Short question shown as the card heading. */
  prompt: string;
  /** Tappable suggestions so the user rarely has to type. */
  options: string[];
  allowMultiple?: boolean;
  /** Free-text placeholder for the "something else" input. */
  customPlaceholder?: string;
};

export type ClarificationNeed = {
  needsClarification: boolean;
  questions: ClarificationQuestion[];
  message: string;
  /** Extracted from prompt when present (e.g. "500 leads"). */
  requestedLeadCount?: number;
};

const LOCATION_OPTIONS = [
  "United States",
  "New York",
  "California",
  "Texas",
  "Remote",
  "United Kingdom",
  "Canada",
];

const JOB_SEEKER_ROLE_OPTIONS = [
  "Software Engineer",
  "Data Analyst",
  "Product Manager",
  "Designer",
  "Marketing Manager",
  "Sales Representative",
];

const BUYER_ROLE_OPTIONS = [
  "Founder / CEO",
  "CTO",
  "VP Sales",
  "Marketing Manager",
  "HR Manager",
  "Operations Manager",
];

const COUNT_OPTIONS = ["100", "250", "500", "1000"];

/** Put anything already parsed from the prompt first, then fill with defaults. */
function suggestOptions(existing: string[], defaults: readonly string[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of [...existing, ...defaults]) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    options.push(clean);
    if (options.length >= 7) break;
  }
  return options;
}

const VAGUE_ROLE =
  /\b(people|person|someone|anyone|folks|candidates|professionals|leads)\b/i;
const HAS_LOCATION =
  /\b(united states|usa|\bus\b|canada|uk|united kingdom|new york|nyc|ny|california|texas|london|remote|pakistan|india|germany|australia)\b/i;
const HAS_COUNT = /\b(\d{1,5})\s*(leads?|people|contacts|profiles|results)?\b/i;
const JOB_SEEKER_INTENT =
  /\b(open\s+to\s+wor|looking\s+for\s+(a\s+)?(job|work)|job\s*seek|recruiter|hiring|between\s+jobs)\b/i;

/** Pull an explicit lead count from the user prompt when present. */
export function extractRequestedLeadCount(prompt: string): number | undefined {
  const match = prompt.match(/\b(\d{1,5})\s*(leads?|people|contacts|profiles|results)\b/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(50_000, n);
  }
  // Bare "500" after "need" / "find" / "get"
  const bare = prompt.match(/\b(?:need|want|get|find|about|around)\s+(\d{2,5})\b/i);
  if (bare) {
    const n = parseInt(bare[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(50_000, n);
  }
  return undefined;
}

/**
 * Decide whether to ask clarifying questions before spending lead credits.
 * Location + role clarity + (for job-seeker/vague prompts) how many leads.
 */
export function needsClarification(
  criteria: SearchCriteria,
  prompt: string
): ClarificationNeed {
  const questions: ClarificationQuestion[] = [];
  const requestedLeadCount = extractRequestedLeadCount(prompt);

  const titles = criteria.apollo?.personTitles ?? criteria.jobTitles ?? [];
  const locations = criteria.apollo?.personLocations ?? [];
  const locationFromPrompt = HAS_LOCATION.test(prompt);
  const hasSpecificLocation =
    locationFromPrompt ||
    (locations.length > 0 &&
      !locations.every((l) => /^(united states|usa|us)$/i.test(l.trim())));

  const genericTitles = titles.every((t) =>
    /^(director|manager|specialist|professional|vp|head of|founder|ceo)$/i.test(t.trim())
  );
  const roleVague =
    titles.length === 0 ||
    (genericTitles && VAGUE_ROLE.test(prompt) && !/\b(engineer|hr|sales|marketing|recruiter|founder|cto|cfo)\b/i.test(prompt));

  const jobSeekerSearch = JOB_SEEKER_INTENT.test(prompt) || criteria.openToWork === true;

  if (!hasSpecificLocation) {
    questions.push({
      id: "location",
      prompt: "Where should we search?",
      options: suggestOptions(locations, LOCATION_OPTIONS),
      allowMultiple: true,
      customPlaceholder: "Another city, state, or country…",
    });
  }

  if (roleVague) {
    questions.push({
      id: "roles",
      prompt: "Which roles should we target?",
      options: suggestOptions(
        titles,
        jobSeekerSearch ? JOB_SEEKER_ROLE_OPTIONS : BUYER_ROLE_OPTIONS
      ),
      allowMultiple: true,
      customPlaceholder: "Another job title…",
    });
  }

  const needsCount =
    requestedLeadCount == null && (jobSeekerSearch || roleVague || !hasSpecificLocation);

  if (needsCount) {
    questions.push({
      id: "count",
      prompt: "How many leads do you want?",
      options: COUNT_OPTIONS,
      customPlaceholder: "A specific number…",
    });
  }

  if (questions.length === 0) {
    return {
      needsClarification: false,
      questions: [],
      message: "",
      requestedLeadCount,
    };
  }

  const message =
    "A couple of quick questions so I only spend your lead credits on the right people.";

  return {
    needsClarification: true,
    questions,
    message,
    requestedLeadCount,
  };
}
