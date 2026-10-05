import { z } from "zod";
import { aiChat } from "@/lib/services/ai/aiRouter";

export const parsedJobDescriptionSchema = z.object({
  title: z.string().min(1),
  alternativeTitles: z.array(z.string()).default([]),
  seniority: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  remote: z.boolean().nullable().optional(),
  minYearsExperience: z.number().nullable().optional(),
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
});

export type ParsedJobDescription = z.infer<typeof parsedJobDescriptionSchema>;

const SYSTEM_PROMPT = `You are an expert technical recruiter analyzing a job description.
Extract structured search requirements as JSON:
- title: string (the exact primary job title, e.g. "Senior Backend Engineer")
- alternativeTitles: array of strings (up to 5 common synonymous or equivalent titles)
- seniority: string | null (e.g. "Junior", "Mid", "Senior", "Lead", "Staff", "Director", "VP", or null if not indicated)
- location: string | null (e.g. "New York, NY", "London, UK", or null if not indicated)
- remote: boolean | null (true if remote or hybrid is allowed/offered, false if strictly on-site, null if unspecified)
- minYearsExperience: number | null (minimum required years of professional experience, or null)
- mustHaveSkills: array of strings (up to 8 essential technologies, core skills, or qualification keywords)
- niceToHaveSkills: array of strings (up to 8 preferred, bonus, or secondary skills)

Rules:
1. Ignore benefits, compensation/salary, company "about us" / marketing background, perks, and EEO/legal disclaimers.
2. Focus strictly on what candidates need to have done or know.
3. Keep skills concise (e.g. "Python", "Kubernetes", "PostgreSQL", "React", "System Design").
4. Cap mustHaveSkills and niceToHaveSkills at 8 items each.
5. Return ONLY a valid JSON object matching the schema.`;

export async function parseJobDescription(
  jobDescription: string,
  options?: { userId?: string }
): Promise<ParsedJobDescription | null> {
  const trimmed = jobDescription?.trim();
  if (!trimmed) return null;

  try {
    const { content } = await aiChat({
      operation: "parse",
      userId: options?.userId,
      system: SYSTEM_PROMPT,
      user: `Job description to parse:\n\n${trimmed.slice(0, 20_000)}`,
      jsonMode: true,
      temperature: 0.1,
    });

    const parsedJson = JSON.parse(content);
    const validated = parsedJobDescriptionSchema.safeParse(parsedJson);

    if (!validated.success) {
      console.warn("[parseJobDescription] validation failed:", validated.error.format());
      return null;
    }

    const data = validated.data;
    return {
      title: data.title.trim(),
      alternativeTitles: (data.alternativeTitles ?? [])
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 5),
      seniority: data.seniority?.trim() || null,
      location: data.location?.trim() || null,
      remote: typeof data.remote === "boolean" ? data.remote : null,
      minYearsExperience:
        typeof data.minYearsExperience === "number" && !isNaN(data.minYearsExperience)
          ? data.minYearsExperience
          : null,
      mustHaveSkills: (data.mustHaveSkills ?? [])
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
      niceToHaveSkills: (data.niceToHaveSkills ?? [])
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
    };
  } catch (error) {
    console.warn("[parseJobDescription] error parsing job description:", error);
    return null;
  }
}

/**
 * Builds a concise search prompt from the extracted requirements to feed
 * into the standard prompt pipeline (parsePromptWithAi).
 */
export function buildSearchPromptFromJobDescription(parsed: ParsedJobDescription): string {
  const parts: string[] = [];

  if (parsed.seniority && !parsed.title.toLowerCase().includes(parsed.seniority.toLowerCase())) {
    parts.push(parsed.seniority);
  }
  parts.push(parsed.title);

  if (parsed.alternativeTitles && parsed.alternativeTitles.length > 0) {
    parts.push(`(${parsed.alternativeTitles.slice(0, 3).join(", ")})`);
  }

  if (parsed.location) {
    parts.push(`in ${parsed.location}`);
  }

  if (parsed.remote) {
    parts.push("remote");
  }

  return parts.join(" ").trim();
}
