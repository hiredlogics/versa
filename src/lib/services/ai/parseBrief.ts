import { z } from "zod";
import { aiChat } from "@/lib/services/ai/aiRouter";
import { normalizeEmployeeRanges, normalizeLocations } from "@/lib/search-criteria";
import type { SearchCriteria } from "@/lib/types";

/**
 * A "brief" is a long, structured request written for a client: who the seller is,
 * target industries, titles, filters, keywords and rules. It is read with its own AI
 * step, because the normal prompt reader keeps only a few titles and one keyword.
 */
export function looksLikeBrief(prompt: string): boolean {
  if (prompt.length < 400) return false;
  const sections = prompt.match(
    /^\s*(?:target\s+)?(?:job\s+titles|titles|industries|company\s+keywords|keywords|location|company\s+size|seniority|qualification|filters)\b[^\n]{0,40}:/gim
  );
  return (sections?.length ?? 0) >= 2;
}

/** Seniority values the people search understands. */
const SENIORITIES = ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior"] as const;

/** The AI sometimes answers a list with one text ("United States"); accept both. */
const list = z.preprocess(
  (v) => (typeof v === "string" ? v.split(/[,;\n]/) : v ?? []),
  z.array(z.string())
);
/** Numbers may arrive as text ("200"). */
const count = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v),
  z.number().nullable().optional()
);

const briefSchema = z.object({
  sellerName: z.string().nullable().optional(),
  offering: z.string().nullable().optional(),
  titles: list,
  seniorities: list,
  locations: list,
  employeeMin: count,
  employeeMax: count,
  companyKeywordTags: list,
  excludedTitles: list,
  avoid: list,
  goodFit: list,
  leadCount: count,
});

export type ParsedBrief = z.infer<typeof briefSchema>;

const SYSTEM = `Read a lead-generation brief and return JSON with these fields:
- sellerName: the company the leads are for, or null.
- offering: what the seller sells, in one short sentence, or null.
- titles: EVERY target job title listed (up to 15), as written, split "Founder / Co-Founder" into two titles.
- seniorities: from the brief's seniority list, using only these values: ${SENIORITIES.join(", ")}.
- locations: places to search, as written (country, state or city).
- employeeMin, employeeMax: the starting company size range, or null.
- companyKeywordTags: 6 to 20 short lowercase phrases (1 to 3 words) that describe the TARGET companies' products or industry, merged from the industries and keywords lists. Examples: "computer vision", "pose estimation", "physical therapy". No duplicates.
- excludedTitles: job titles to avoid (e.g. "personal trainer"), or [].
- avoid: kinds of companies to avoid, as short phrases.
- goodFit: up to 6 short rules that describe a good-fit company.
- leadCount: how many leads to start with, or null.
Return only the JSON object.`;

export async function parseBrief(prompt: string, userId?: string): Promise<ParsedBrief | null> {
  try {
    const { content } = await aiChat({
      operation: "parse",
      userId,
      system: SYSTEM,
      user: prompt.slice(0, 20_000),
      jsonMode: true,
      temperature: 0,
    });
    const parsed = briefSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.warn("[parseBrief] unexpected answer:", parsed.error.issues.slice(0, 3));
      return null;
    }
    const b = parsed.data;
    const clean = (list: string[], max: number) =>
      [...new Map(list.map((x) => [x.trim().toLowerCase(), x.trim()])).values()].filter(Boolean).slice(0, max);
    return {
      ...b,
      titles: clean(b.titles, 15),
      seniorities: b.seniorities.map((s) => s.trim().toLowerCase()).filter((s) => (SENIORITIES as readonly string[]).includes(s)),
      locations: clean(b.locations, 3),
      companyKeywordTags: clean(b.companyKeywordTags.map((t) => t.toLowerCase()), 20),
      excludedTitles: clean(b.excludedTitles, 10),
      avoid: clean(b.avoid, 8),
      goodFit: clean(b.goodFit, 6),
    };
  } catch (error) {
    console.warn("[parseBrief] could not read brief:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Search criteria for a brief: all titles, seniorities, size and company tags in one search. */
export function criteriaFromBrief(brief: ParsedBrief): SearchCriteria | null {
  // Without titles/seniorities or company tags the brief is not specific enough.
  if ((!brief.titles.length && !brief.seniorities.length) || !brief.companyKeywordTags.length) return null;

  const min = brief.employeeMin ?? 1;
  const max = brief.employeeMax ?? 10_000;
  const locations = normalizeLocations(brief.locations);
  const seller = brief.sellerName?.trim() || "the seller";
  const fitNotes = [
    brief.offering ? `${seller} sells: ${brief.offering}` : "",
    brief.goodFit.length ? `Good fit: ${brief.goodFit.join("; ")}` : "",
    brief.avoid.length ? `Avoid: ${brief.avoid.join("; ")}` : "",
  ].filter(Boolean);

  return {
    industry: brief.companyKeywordTags[0],
    country: locations[0] ?? "",
    companySizeMin: min,
    companySizeMax: max,
    jobTitles: brief.titles,
    // Company tags are industries, not skills, so the skills line stays off.
    keywords: "",
    summary: `${brief.titles.slice(0, 3).join(", ")}${brief.titles.length > 3 ? " and more" : ""} at ${brief.companyKeywordTags.slice(0, 3).join(", ")} companies${locations.length ? ` in ${locations.join(", ")}` : ""}`,
    searchIntent: `Decision makers at companies that could buy from ${seller}. ${fitNotes.join(". ")}`.slice(0, 1200),
    requireEmail: true,
    excludedTitles: brief.excludedTitles,
    briefSearch: true,
    apollo: {
      personTitles: brief.titles,
      personLocations: locations,
      employeeRanges: normalizeEmployeeRanges(undefined, min, max),
      organizationKeywordTags: brief.companyKeywordTags,
      personSeniorities: brief.seniorities,
      includeSimilarTitles: true,
    },
  };
}

export async function buildBriefCriteria(
  prompt: string,
  userId?: string
): Promise<{ criteria: SearchCriteria; leadCount: number | null } | null> {
  const brief = await parseBrief(prompt, userId);
  if (!brief) return null;
  const criteria = criteriaFromBrief(brief);
  return criteria ? { criteria, leadCount: brief.leadCount ?? null } : null;
}
