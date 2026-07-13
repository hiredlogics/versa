import { z } from "zod";

export const parsedSearchCriteriaSchema = z.object({
  industry: z.string().nullable(),
  country: z.string().nullable(),
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

export const findLeadsInputSchema = z.object({
  prompt: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  companyUrl: z.string().optional(),
  companyName: z.string().optional(),
  inputType: z.enum(["prompt", "linkedin", "company_url", "company_name", "persona"]).default("prompt"),
  minScore: z.number().min(1).max(10).optional(),
});

export const leadScoreResultSchema = z.object({
  leadScore: z.number().min(1).max(10),
  priorityLevel: z.enum(["Low", "Medium", "High", "Very High"]),
  reasoning: z.string(),
  recommendedApproach: z.string(),
});

export type LeadScoreResult = z.infer<typeof leadScoreResultSchema>;
