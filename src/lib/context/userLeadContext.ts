import { prisma } from "@/lib/db/prisma";
import {
  getCachedUserLeadContext,
  invalidateUserLeadContext,
  setCachedUserLeadContext,
} from "@/lib/cache/contextCache";
import {
  onboardingContextCompleteSchema,
  onboardingContextFieldsSchema,
  toContextDTO,
  type OnboardingContextInput,
  type UserLeadContextDTO,
} from "@/lib/validations/onboarding-context";
import type { UserLeadContext } from "@prisma/client";

export class OnboardingRequiredError extends Error {
  redirect = "/onboarding";
  constructor(message = "Complete onboarding before searching for leads.") {
    super(message);
    this.name = "OnboardingRequiredError";
  }
}

function jsonArray(v: string[] | undefined, fallback: string[] = []): string[] {
  return v ?? fallback;
}

function toDbData(input: OnboardingContextInput) {
  return {
    companyName: input.companyName ?? undefined,
    websiteUrl: input.websiteUrl ?? undefined,
    businessDescription: input.businessDescription ?? undefined,
    targetMarket: input.targetMarket ?? undefined,
    mainOffer: input.mainOffer ?? undefined,
    targetIndustries: jsonArray(input.targetIndustries),
    targetCountries: jsonArray(input.targetCountries),
    companySizeMin: input.companySizeMin,
    companySizeMax: input.companySizeMax,
    targetTitles: jsonArray(input.targetTitles),
    targetSeniorities: jsonArray(input.targetSeniorities),
    excludedIndustries: jsonArray(input.excludedIndustries),
    excludedTitles: jsonArray(input.excludedTitles),
    preferredBuyingSignals: jsonArray(input.preferredBuyingSignals),
    highQualityLeadNotes: input.highQualityLeadNotes ?? undefined,
    badLeadNotes: input.badLeadNotes ?? undefined,
    preferredOutreachAngle: input.preferredOutreachAngle ?? undefined,
    servicesToSell: jsonArray(input.servicesToSell),
    minLeadScore: input.minLeadScore ?? 8,
  };
}

export async function loadUserLeadContextFromDb(
  userId: string
): Promise<UserLeadContextDTO | null> {
  const row = await prisma.userLeadContext.findUnique({ where: { userId } });
  if (!row) return null;
  return toContextDTO(row);
}

export async function getUserLeadContext(userId: string): Promise<UserLeadContextDTO | null> {
  const cached = getCachedUserLeadContext(userId);
  if (cached) return cached;

  const dto = await loadUserLeadContextFromDb(userId);
  if (dto) setCachedUserLeadContext(userId, dto);
  return dto;
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const ctx = await getUserLeadContext(userId);
  return ctx?.onboardingCompleted === true;
}

export async function requireOnboardingComplete(userId: string): Promise<UserLeadContextDTO> {
  const ctx = await getUserLeadContext(userId);
  if (!ctx?.onboardingCompleted) {
    throw new OnboardingRequiredError();
  }
  return ctx;
}

export async function upsertUserLeadContext(
  userId: string,
  input: OnboardingContextInput,
  options: { markComplete?: boolean } = {}
): Promise<UserLeadContextDTO> {
  const fields = onboardingContextFieldsSchema.parse(input);
  const data = toDbData(fields);

  let onboardingCompleted = false;
  if (options.markComplete) {
    onboardingContextCompleteSchema.parse({
      ...fields,
      businessDescription: fields.businessDescription,
      targetIndustries: fields.targetIndustries ?? [],
      targetCountries: fields.targetCountries ?? [],
      companySizeMin: fields.companySizeMin,
      companySizeMax: fields.companySizeMax,
      targetTitles: fields.targetTitles ?? [],
      servicesToSell: fields.servicesToSell ?? [],
      minLeadScore: fields.minLeadScore ?? 8,
    });
    onboardingCompleted = true;
  }

  const row = await prisma.userLeadContext.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
      onboardingCompleted,
    },
    update: {
      ...data,
      ...(options.markComplete ? { onboardingCompleted: true } : {}),
    },
  });

  const dto = toContextDTO(row);
  setCachedUserLeadContext(userId, dto);
  return dto;
}

export async function patchUserLeadContext(
  userId: string,
  input: OnboardingContextInput
): Promise<UserLeadContextDTO> {
  const fields = onboardingContextFieldsSchema.parse(input);
  const existing = await prisma.userLeadContext.findUnique({ where: { userId } });

  const merged: OnboardingContextInput = existing
    ? {
        companyName: fields.companyName ?? existing.companyName ?? undefined,
        websiteUrl: fields.websiteUrl ?? existing.websiteUrl ?? undefined,
        businessDescription: fields.businessDescription ?? existing.businessDescription ?? undefined,
        targetMarket: fields.targetMarket ?? existing.targetMarket ?? undefined,
        mainOffer: fields.mainOffer ?? existing.mainOffer ?? undefined,
        targetIndustries:
          fields.targetIndustries ??
          (Array.isArray(existing.targetIndustries) ? (existing.targetIndustries as string[]) : []),
        targetCountries:
          fields.targetCountries ??
          (Array.isArray(existing.targetCountries) ? (existing.targetCountries as string[]) : []),
        companySizeMin: fields.companySizeMin ?? existing.companySizeMin ?? undefined,
        companySizeMax: fields.companySizeMax ?? existing.companySizeMax ?? undefined,
        targetTitles:
          fields.targetTitles ??
          (Array.isArray(existing.targetTitles) ? (existing.targetTitles as string[]) : []),
        targetSeniorities:
          fields.targetSeniorities ??
          (Array.isArray(existing.targetSeniorities) ? (existing.targetSeniorities as string[]) : []),
        excludedIndustries:
          fields.excludedIndustries ??
          (Array.isArray(existing.excludedIndustries) ? (existing.excludedIndustries as string[]) : []),
        excludedTitles:
          fields.excludedTitles ??
          (Array.isArray(existing.excludedTitles) ? (existing.excludedTitles as string[]) : []),
        preferredBuyingSignals:
          fields.preferredBuyingSignals ??
          (Array.isArray(existing.preferredBuyingSignals)
            ? (existing.preferredBuyingSignals as string[])
            : []),
        highQualityLeadNotes: fields.highQualityLeadNotes ?? existing.highQualityLeadNotes ?? undefined,
        badLeadNotes: fields.badLeadNotes ?? existing.badLeadNotes ?? undefined,
        preferredOutreachAngle:
          fields.preferredOutreachAngle ?? existing.preferredOutreachAngle ?? undefined,
        servicesToSell:
          fields.servicesToSell ??
          (Array.isArray(existing.servicesToSell) ? (existing.servicesToSell as string[]) : []),
        minLeadScore: fields.minLeadScore ?? existing.minLeadScore ?? 8,
      }
    : fields;

  let onboardingCompleted = existing?.onboardingCompleted ?? false;
  try {
    onboardingContextCompleteSchema.parse({
      ...merged,
      businessDescription: merged.businessDescription,
      targetIndustries: merged.targetIndustries ?? [],
      targetCountries: merged.targetCountries ?? [],
      companySizeMin: merged.companySizeMin,
      companySizeMax: merged.companySizeMax,
      targetTitles: merged.targetTitles ?? [],
      servicesToSell: merged.servicesToSell ?? [],
      minLeadScore: merged.minLeadScore ?? 8,
    });
    onboardingCompleted = true;
  } catch {
    // keep existing completion state if patch is partial
  }

  if (!existing) {
    return upsertUserLeadContext(userId, merged, { markComplete: onboardingCompleted });
  }

  const row = await prisma.userLeadContext.update({
    where: { userId },
    data: {
      ...toDbData(merged),
      onboardingCompleted,
    },
  });

  invalidateUserLeadContext(userId);
  const dto = toContextDTO(row);
  setCachedUserLeadContext(userId, dto);
  return dto;
}

export function contextForAiParser(ctx: UserLeadContextDTO | null): Record<string, unknown> | null {
  if (!ctx) return null;
  return {
    companyName: ctx.companyName,
    websiteUrl: ctx.websiteUrl,
    businessDescription: ctx.businessDescription,
    targetMarket: ctx.targetMarket,
    mainOffer: ctx.mainOffer,
    targetIndustries: ctx.targetIndustries,
    targetCountries: ctx.targetCountries,
    companySizeMin: ctx.companySizeMin,
    companySizeMax: ctx.companySizeMax,
    targetTitles: ctx.targetTitles,
    targetSeniorities: ctx.targetSeniorities,
    excludedIndustries: ctx.excludedIndustries,
    excludedTitles: ctx.excludedTitles,
    preferredBuyingSignals: ctx.preferredBuyingSignals,
    highQualityLeadNotes: ctx.highQualityLeadNotes,
    badLeadNotes: ctx.badLeadNotes,
    preferredOutreachAngle: ctx.preferredOutreachAngle,
    servicesToSell: ctx.servicesToSell,
    minLeadScore: ctx.minLeadScore,
  };
}

export type { UserLeadContext };
