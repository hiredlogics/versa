import { z } from "zod";

export const parsedSearchCriteriaSchema = z.object({
  industry: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  companySizeMin: z.number().nullable(),
  companySizeMax: z.number().nullable(),
  jobTitles: z.array(z.string()),
  seniorityLevels: z.array(z.string()),
  keywords: z.array(z.string()),
  companyNames: z.array(z.string()),
  companyDomains: z.array(z.string()),
  linkedinUrls: z.array(z.string()),
  intentSummary: z.string(),
});

export type ParsedSearchCriteria = z.infer<typeof parsedSearchCriteriaSchema>;

/**
 * Schema for raw LLM JSON from parsePromptWithAi (before normalizeSearchCriteria).
 * Used to catch malformed/incomplete filter objects that silently become weak defaults.
 */
export const aiParsePromptOutputSchema = z
  .object({
    summary: z.string().optional(),
    searchIntent: z.string().optional(),
    industry: z.union([z.string(), z.null()]).optional(),
    country: z.union([z.string(), z.null()]).optional(),
    city: z.union([z.string(), z.null()]).optional(),
    state: z.union([z.string(), z.null()]).optional(),
    companySizeMin: z.union([z.number(), z.null()]).optional(),
    companySizeMax: z.union([z.number(), z.null()]).optional(),
    openToWork: z.boolean().optional(),
    requireEmail: z.boolean().optional(),
    seniorityLevels: z.array(z.string()).optional(),
    companyNames: z.array(z.string()).optional(),
    companyDomains: z.array(z.string()).optional(),
    linkedinUrls: z.array(z.string()).optional(),
    jobTitles: z.array(z.string()).optional(),
    keywords: z.union([z.string(), z.array(z.string())]).optional(),
    excludedTitles: z.array(z.string()).optional(),
    excludedIndustries: z.array(z.string()).optional(),
    assumptionsUsedFromContext: z.array(z.string()).optional(),
    explicitOverridesFromPrompt: z.array(z.string()).optional(),
    apollo: z
      .object({
        personTitles: z.array(z.string()).min(1, "apollo.personTitles must be non-empty"),
        personLocations: z.array(z.string()).min(1, "apollo.personLocations must be non-empty"),
        qKeywords: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
        employeeRanges: z.array(z.string()).optional(),
        includeSimilarTitles: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const hasTitles =
      (data.apollo?.personTitles?.length ?? 0) > 0 || (data.jobTitles?.length ?? 0) > 0;
    if (!hasTitles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing personTitles/jobTitles, filters would fall back to generic defaults",
        path: ["apollo", "personTitles"],
      });
    }
  });

export type AiParsePromptOutput = z.infer<typeof aiParsePromptOutputSchema>;

/** What Versa reads from a pasted job description. */
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

export const findLeadsInputSchema = z
  .object({
    prompt: z.string().optional(),
    jobDescription: z
      .string()
      .max(20_000, "Job description must be 20,000 characters or fewer")
      .optional(),
    /** Requirements already read from this conversation's job description (follow-ups). */
    jobRequirements: parsedJobDescriptionSchema.optional(),
    inputType: z
      .enum(["prompt", "persona", "job_description"])
      .default("prompt"),
    minScore: z.number().min(1).max(10).optional(),
    /** How many leads the user wants this run (clamped to remaining credits + batch size). */
    requestedLeadCount: z.number().int().min(1).max(50_000).optional(),
    /** When true, skip clarification and start the job (user already answered). */
    skipClarification: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.inputType !== "job_description" ||
      Boolean(data.jobDescription?.trim()) ||
      Boolean(data.jobRequirements),
    { message: "Paste a job description to search with.", path: ["jobDescription"] }
  );

export const leadScoreResultSchema = z.object({
  leadScore: z.number().min(1).max(10),
  priorityLevel: z.enum(["Low", "Medium", "High", "Very High"]),
  reasoning: z.string(),
  recommendedApproach: z.string(),
});

export type LeadScoreResult = z.infer<typeof leadScoreResultSchema>;
