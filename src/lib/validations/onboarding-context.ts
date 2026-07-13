import { z } from "zod";

function dedupeTrimmed(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

const stringArray = z.array(z.string()).transform(dedupeTrimmed);

const nonEmptyStringArray = z
  .array(z.string())
  .transform(dedupeTrimmed)
  .refine((arr) => arr.length > 0, { message: "At least one item is required" });

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .refine((v) => v === undefined || /^https?:\/\/.+/i.test(v), {
    message: "Invalid URL",
  });

export const onboardingContextFieldsSchema = z.object({
  companyName: z.string().trim().max(200).optional(),
  websiteUrl: optionalUrl,
  businessDescription: z.string().trim().max(2000).optional(),
  targetMarket: z.string().trim().max(1000).optional(),
  mainOffer: z.string().trim().max(1000).optional(),
  targetIndustries: stringArray.optional(),
  targetCountries: stringArray.optional(),
  companySizeMin: z.number().int().min(1).max(100000).optional(),
  companySizeMax: z.number().int().min(1).max(100000).optional(),
  targetTitles: stringArray.optional(),
  targetSeniorities: stringArray.optional(),
  excludedIndustries: stringArray.optional(),
  excludedTitles: stringArray.optional(),
  preferredBuyingSignals: stringArray.optional(),
  highQualityLeadNotes: z.string().trim().max(2000).optional(),
  badLeadNotes: z.string().trim().max(2000).optional(),
  preferredOutreachAngle: z.string().trim().max(1000).optional(),
  servicesToSell: stringArray.optional(),
  minLeadScore: z.number().int().min(1).max(10).optional(),
});

export const onboardingContextCompleteSchema = z
  .object({
    companyName: z.string().trim().max(200).optional(),
    websiteUrl: optionalUrl,
    businessDescription: z.string().trim().min(10).max(2000),
    targetMarket: z.string().trim().max(1000).optional(),
    mainOffer: z.string().trim().max(1000).optional(),
    targetIndustries: nonEmptyStringArray,
    targetCountries: nonEmptyStringArray,
    companySizeMin: z.number().int().min(1),
    companySizeMax: z.number().int().min(1),
    targetTitles: nonEmptyStringArray,
    targetSeniorities: stringArray.optional(),
    excludedIndustries: stringArray.optional(),
    excludedTitles: stringArray.optional(),
    preferredBuyingSignals: stringArray.optional(),
    highQualityLeadNotes: z.string().trim().max(2000).optional(),
    badLeadNotes: z.string().trim().max(2000).optional(),
    preferredOutreachAngle: z.string().trim().max(1000).optional(),
    servicesToSell: nonEmptyStringArray,
    minLeadScore: z.number().int().min(1).max(10).default(8),
  })
  .refine((d) => d.companySizeMin < d.companySizeMax, {
    message: "Company size minimum must be less than maximum",
    path: ["companySizeMax"],
  });

export type OnboardingContextInput = z.infer<typeof onboardingContextFieldsSchema>;
export type OnboardingContextComplete = z.infer<typeof onboardingContextCompleteSchema>;

export interface UserLeadContextDTO {
  id: string;
  userId: string;
  companyName: string | null;
  websiteUrl: string | null;
  businessDescription: string | null;
  targetMarket: string | null;
  mainOffer: string | null;
  targetIndustries: string[];
  targetCountries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  targetTitles: string[];
  targetSeniorities: string[];
  excludedIndustries: string[];
  excludedTitles: string[];
  preferredBuyingSignals: string[];
  highQualityLeadNotes: string | null;
  badLeadNotes: string | null;
  preferredOutreachAngle: string | null;
  servicesToSell: string[];
  minLeadScore: number;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toContextDTO(
  row: {
    id: string;
    userId: string;
    companyName: string | null;
    websiteUrl: string | null;
    businessDescription: string | null;
    targetMarket: string | null;
    mainOffer: string | null;
    targetIndustries: unknown;
    targetCountries: unknown;
    companySizeMin: number | null;
    companySizeMax: number | null;
    targetTitles: unknown;
    targetSeniorities: unknown;
    excludedIndustries: unknown;
    excludedTitles: unknown;
    preferredBuyingSignals: unknown;
    highQualityLeadNotes: string | null;
    badLeadNotes: string | null;
    preferredOutreachAngle: string | null;
    servicesToSell: unknown;
    minLeadScore: number;
    onboardingCompleted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }
): UserLeadContextDTO {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return {
    id: row.id,
    userId: row.userId,
    companyName: row.companyName,
    websiteUrl: row.websiteUrl,
    businessDescription: row.businessDescription,
    targetMarket: row.targetMarket,
    mainOffer: row.mainOffer,
    targetIndustries: arr(row.targetIndustries),
    targetCountries: arr(row.targetCountries),
    companySizeMin: row.companySizeMin,
    companySizeMax: row.companySizeMax,
    targetTitles: arr(row.targetTitles),
    targetSeniorities: arr(row.targetSeniorities),
    excludedIndustries: arr(row.excludedIndustries),
    excludedTitles: arr(row.excludedTitles),
    preferredBuyingSignals: arr(row.preferredBuyingSignals),
    highQualityLeadNotes: row.highQualityLeadNotes,
    badLeadNotes: row.badLeadNotes,
    preferredOutreachAngle: row.preferredOutreachAngle,
    servicesToSell: arr(row.servicesToSell),
    minLeadScore: row.minLeadScore,
    onboardingCompleted: row.onboardingCompleted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function contextSummaryLine(ctx: UserLeadContextDTO): string {
  const parts: string[] = [];
  if (ctx.targetIndustries.length) parts.push(ctx.targetIndustries.slice(0, 3).join(", "));
  if (ctx.targetCountries.length) parts.push(ctx.targetCountries.slice(0, 2).join("/"));
  if (ctx.targetTitles.length) parts.push(ctx.targetTitles.slice(0, 3).join(", "));
  return parts.join(" · ") || "No ICP saved yet";
}
