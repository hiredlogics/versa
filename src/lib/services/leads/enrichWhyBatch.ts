import { prisma } from "@/lib/db/prisma";
import { enrichPeopleBatch, formatApolloPerson, isUsableEmail } from "@/lib/apollo";
import { extractProfileSummary, toStoredApolloProfile } from "@/lib/lead-profile";
import {
  buildLeadWhyReasoning,
  generateLeadReasoningBatch,
} from "@/lib/services/ai/leadReasoning";
import { buildScoringContextFromLeadContext } from "@/lib/context/exclusions";
import { getUserLeadContext } from "@/lib/context/userLeadContext";
import { LEAD_BATCH_SIZE, shouldIgnoreLeadContext } from "@/lib/apollo-config";
import { mapLeadToRecord } from "@/lib/services/searches/searchHistory";
import type { LeadScoreContext } from "@/lib/types";
import type { LeadRecord } from "@/lib/types/lead-finder";
import type { Lead } from "@prisma/client";
import type { ApolloPerson } from "@/lib/types";

/** How many Apollo enrich calls per page request / job chunk. */
export function getEnrichBatchSize(): number {
  return Math.min(
    100,
    Math.max(5, parseInt(process.env.APOLLO_ENRICH_BATCH_SIZE || "25", 10))
  );
}

/** Max enrich calls for one page prepare request, default full page (200). */
export function getEnrichPageCap(): number {
  return Math.min(
    200,
    Math.max(10, parseInt(process.env.APOLLO_ENRICH_PAGE_CAP || "200", 10))
  );
}

function needsEmailReveal(lead: Pick<Lead, "email" | "hasEmail" | "rawApolloData">): boolean {
  // Always try Apollo unlock when we don't have a real email yet
  return !isUsableEmail(lead.email);
}

function needsWhyUpgrade(lead: Pick<Lead, "reasoning" | "email" | "hasEmail">): boolean {
  const why = lead.reasoning?.trim() ?? "";
  if (why.length < 40) return true;
  if (/^matching role/i.test(why)) return true;
  if (/matches your search intent/i.test(why)) return true;
  if (/good company size/i.test(why)) return true;
  if (isUsableEmail(lead.email) && /reach out via linkedin if email is missing/i.test(why)) {
    return true;
  }
  return false;
}

export function scoreContextFromSearch(input: {
  prompt: string;
  parsedCriteria: unknown;
  leadContext: Awaited<ReturnType<typeof getUserLeadContext>> | null;
}): LeadScoreContext {
  const criteria =
    input.parsedCriteria && typeof input.parsedCriteria === "object"
      ? (input.parsedCriteria as {
          searchIntent?: string;
          keywords?: string[] | string;
          openToWork?: boolean;
          requireEmail?: boolean;
          excludedTitles?: string[];
          excludedIndustries?: string[];
        })
      : {};

  const keywords = Array.isArray(criteria.keywords)
    ? criteria.keywords.join(" ")
    : typeof criteria.keywords === "string"
      ? criteria.keywords
      : "";

  const ctx = buildScoringContextFromLeadContext(
    input.leadContext,
    {
      searchIntent: criteria.searchIntent,
      keywords,
      excludedTitles: criteria.excludedTitles,
      excludedIndustries: criteria.excludedIndustries,
    },
    input.prompt
  );
  ctx.openToWork = Boolean(criteria.openToWork);
  ctx.requireEmail = Boolean(criteria.requireEmail);
  if (shouldIgnoreLeadContext()) ctx.leadContext = null;
  return ctx;
}

type EnrichableLead = {
  apolloPersonId: string;
  name: string;
  title: string;
  company: string;
  industry: string | null;
  employees: number | null;
  location: string | null;
  email: string | null;
  emailStatus?: string | null;
  linkedinUrl: string | null;
  hasEmail: boolean;
  leadScore: number;
  reasoning: string;
};

/**
 * Enrich Apollo people (email/profile) then write personalized Why Reach Out.
 * Mutates `leads` in place; returns maps for DB persistence.
 */
export async function enrichAndWhyInMemory(
  leads: EnrichableLead[],
  peopleById: Map<string, ApolloPerson>,
  scoreContext: LeadScoreContext,
  options: {
    userId: string;
    searchId: string;
    maxEnrich: number;
    /** When true, only unlock emails/profiles, skip AI/template Why (caller filters then writes Why). */
    skipWhy?: boolean;
    onProgress?: (note: string) => void | Promise<void>;
  }
): Promise<{
  enrichedRawMap: Map<string, unknown>;
  enrichedCount: number;
  emailsUnlocked: number;
}> {
  const enrichedRawMap = new Map<string, unknown>();
  if (leads.length === 0 || options.maxEnrich <= 0) {
    if (!options.skipWhy) {
      for (const lead of leads) {
        lead.reasoning = buildLeadWhyReasoning(
          {
            name: lead.name,
            title: lead.title,
            company: lead.company,
            industry: lead.industry ?? "N/A",
            employees: lead.employees ?? 0,
            location: lead.location ?? "N/A",
            hasEmail: lead.hasEmail,
            leadScore: lead.leadScore,
          },
          scoreContext
        ).reasoning;
      }
    }
    return { enrichedRawMap, enrichedCount: 0, emailsUnlocked: 0 };
  }

  // Prefer people Apollo flagged as having email, then higher score
  const ranked = [...leads].sort((a, b) => {
    const aNeed = Number(!isUsableEmail(a.email) && a.hasEmail);
    const bNeed = Number(!isUsableEmail(b.email) && b.hasEmail);
    if (bNeed !== aNeed) return bNeed - aNeed;
    return b.leadScore - a.leadScore;
  });

  const toEnrichPeople: ApolloPerson[] = [];
  for (const lead of ranked) {
    if (toEnrichPeople.length >= options.maxEnrich) break;
    if (isUsableEmail(lead.email)) continue;
    const person = peopleById.get(lead.apolloPersonId);
    if (!person) {
      toEnrichPeople.push({
        id: lead.apolloPersonId,
        first_name: lead.name.split(" ")[0] || "",
        last_name: lead.name.split(" ").slice(1).join(" ") || "",
        title: lead.title,
        email: null,
        linkedin_url: lead.linkedinUrl,
        has_email: lead.hasEmail,
        organization: {
          name: lead.company,
          industry: lead.industry ?? "",
          estimated_num_employees: lead.employees ?? 0,
          city: "",
          state: "",
          country: "",
        },
      });
      continue;
    }
    toEnrichPeople.push(person);
  }

  await options.onProgress?.(
    `Revealing emails for ${toEnrichPeople.length.toLocaleString()} leads (batch)…`
  );

  const enriched = await enrichPeopleBatch(toEnrichPeople);
  const enrichedMap = new Map(
    enriched.map((result) => [result.person.id, formatApolloPerson(result.person)])
  );
  const enrichedProfileMap = new Map(
    enriched.map((result) => [result.person.id, extractProfileSummary(result.raw)])
  );

  for (const result of enriched) {
    const stored = toStoredApolloProfile(result.raw);
    if (stored) enrichedRawMap.set(result.person.id, stored);
  }

  let emailsUnlocked = 0;
  for (const lead of leads) {
    const full = enrichedMap.get(lead.apolloPersonId);
    if (!full) continue;
    const before = isUsableEmail(lead.email);
    lead.name = full.name !== "Unknown" ? full.name : lead.name;
    lead.title = full.title !== "N/A" ? full.title : lead.title;
    lead.company = full.company !== "Unknown" ? full.company : lead.company;
    lead.industry = full.industry !== "N/A" ? full.industry : lead.industry;
    lead.employees = full.employees || lead.employees;
    lead.location = full.location !== "N/A" ? full.location : lead.location;
    if (isUsableEmail(full.email)) {
      lead.email = full.email;
      lead.emailStatus = full.emailStatus ?? lead.emailStatus ?? null;
    }
    lead.linkedinUrl = full.linkedinUrl || lead.linkedinUrl;
    lead.hasEmail = Boolean(isUsableEmail(lead.email));
    if (!before && isUsableEmail(lead.email)) emailsUnlocked += 1;
  }

  if (options.skipWhy) {
    return { enrichedRawMap, enrichedCount: enriched.length, emailsUnlocked };
  }

  await options.onProgress?.(
    `Writing Why Reach Out for ${leads.length.toLocaleString()} leads…`
  );

  // AI Why for enriched + high-score first; template for the rest
  const whyAiMax = LEAD_BATCH_SIZE;
  const forWhy = [...leads].sort((a, b) => {
    const aEnriched = enrichedRawMap.has(a.apolloPersonId) ? 1 : 0;
    const bEnriched = enrichedRawMap.has(b.apolloPersonId) ? 1 : 0;
    if (bEnriched !== aEnriched) return bEnriched - aEnriched;
    return b.leadScore - a.leadScore;
  });

  const whyInputs = forWhy.map((lead) => ({
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry ?? "N/A",
    employees: lead.employees ?? 0,
    location: lead.location ?? "N/A",
    hasEmail: lead.hasEmail,
    leadScore: lead.leadScore,
    profileSummary: enrichedProfileMap.get(lead.apolloPersonId) ?? null,
  }));

  const aiSlice = whyInputs.slice(0, whyAiMax);
  const outreach = await generateLeadReasoningBatch(aiSlice, scoreContext, {
    userId: options.userId,
    searchId: options.searchId,
  });

  const whyById = new Map<string, string>();
  for (let i = 0; i < forWhy.length; i++) {
    const lead = forWhy[i];
    if (i < aiSlice.length && outreach[i]?.reasoning) {
      whyById.set(lead.apolloPersonId, outreach[i].reasoning);
    } else {
      whyById.set(lead.apolloPersonId, buildLeadWhyReasoning(whyInputs[i], scoreContext).reasoning);
    }
  }

  for (const lead of leads) {
    lead.reasoning = whyById.get(lead.apolloPersonId) || lead.reasoning;
  }

  return { enrichedRawMap, enrichedCount: enriched.length, emailsUnlocked };
}

/** Keep only leads with a real unlocked email (uses shared isUsableEmail). */
export function filterLeadsWithUsableEmail<T extends { email: string | null | undefined }>(
  leads: T[]
): T[] {
  return leads.filter((lead) => isUsableEmail(lead.email));
}

/**
 * Enrich + Why for one page of already-saved leads (Next/Previous 200).
 * Never drops leads: only fills email / Why where missing.
 */
export async function prepareLeadPage(input: {
  userId: string;
  searchId: string;
  offset: number;
  limit: number;
}): Promise<{ leads: LeadRecord[]; enriched: number; whyUpdated: number; emailsUnlocked: number }> {
  const search = await prisma.leadSearch.findFirst({
    where: { id: input.searchId, userId: input.userId, deletedAt: null },
  });
  if (!search) throw new Error("Search not found");

  const offset = Math.max(0, input.offset);
  const limit = Math.min(200, Math.max(1, input.limit));

  const pageLeads = await prisma.lead.findMany({
    where: { searchId: input.searchId, userId: input.userId, deletedAt: null },
    orderBy: { leadScore: "desc" },
    skip: offset,
    take: limit,
  });

  if (pageLeads.length === 0) {
    return { leads: [], enriched: 0, whyUpdated: 0, emailsUnlocked: 0 };
  }

  const leadContext = shouldIgnoreLeadContext()
    ? null
    : await getUserLeadContext(input.userId);
  const scoreContext = scoreContextFromSearch({
    prompt: search.prompt,
    parsedCriteria: search.parsedCriteria,
    leadContext,
  });

  const candidates = pageLeads.filter(
    (l) => needsEmailReveal(l) || needsWhyUpgrade(l)
  );
  const pageCap = getEnrichPageCap();
  // Search-time bulk matching already stored the complete Apollo payload. Page
  // preparation only improves Why text; it must never trigger another unlock.
  const toEnrich: typeof pageLeads = [];
  /* const toEnrich = candidates
    .filter((l) => l.apolloPersonId && needsEmailReveal(l))
    .sort((a, b) => {
      const aNeed = Number(!isUsableEmail(a.email) && a.hasEmail);
      const bNeed = Number(!isUsableEmail(b.email) && b.hasEmail);
      if (bNeed !== aNeed) return bNeed - aNeed;
      return b.leadScore - a.leadScore;
    })
    .slice(0, pageCap); */

  let enrichedCount = 0;
  let emailsUnlocked = 0;
  const profileByApolloId = new Map<string, string | null>();

  if (toEnrich.length > 0) {
    const fakePeople: ApolloPerson[] = toEnrich.map((l) => ({
      id: l.apolloPersonId!,
      first_name: l.name.split(" ")[0] || "",
      last_name: l.name.split(" ").slice(1).join(" ") || "",
      title: l.title,
      email: isUsableEmail(l.email) ? l.email : null,
      linkedin_url: l.linkedinUrl,
      has_email: l.hasEmail,
      organization: {
        name: l.company,
        industry: l.industry ?? "",
        estimated_num_employees: l.employees ?? 0,
        city: "",
        state: "",
        country: "",
      },
    }));

    const enriched = await enrichPeopleBatch(fakePeople);
    enrichedCount = enriched.length;

    for (const result of enriched) {
      const full = formatApolloPerson(result.person);
      const lead = pageLeads.find((l) => l.apolloPersonId === result.person.id);
      if (!lead) continue;

      const email = isUsableEmail(full.email)
        ? full.email!.trim()
        : isUsableEmail(lead.email)
          ? lead.email
          : null;
      const hasEmail = Boolean(email) || lead.hasEmail;
      const raw = toStoredApolloProfile(result.raw);
      profileByApolloId.set(result.person.id, extractProfileSummary(result.raw));

      if (isUsableEmail(email) && !isUsableEmail(lead.email)) {
        emailsUnlocked += 1;
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: full.name !== "Unknown" ? full.name : lead.name,
          title: full.title !== "N/A" ? full.title : lead.title,
          company: full.company !== "Unknown" ? full.company : lead.company,
          industry: full.industry !== "N/A" ? full.industry : lead.industry,
          employees: full.employees || lead.employees,
          location: full.location !== "N/A" ? full.location : lead.location,
          email,
          emailStatus: isUsableEmail(full.email)
            ? (full.emailStatus ?? null)
            : lead.emailStatus,
          linkedinUrl: full.linkedinUrl || lead.linkedinUrl,
          hasEmail,
          rawApolloData: raw ?? undefined,
        },
      });

      lead.name = full.name !== "Unknown" ? full.name : lead.name;
      lead.title = full.title !== "N/A" ? full.title : lead.title;
      lead.company = full.company !== "Unknown" ? full.company : lead.company;
      lead.industry = full.industry !== "N/A" ? full.industry : lead.industry;
      lead.employees = full.employees || lead.employees;
      lead.location = full.location !== "N/A" ? full.location : lead.location;
      lead.email = email;
      lead.linkedinUrl = full.linkedinUrl || lead.linkedinUrl;
      lead.hasEmail = hasEmail;
      if (raw) lead.rawApolloData = raw as Lead["rawApolloData"];
    }
  }

  // Why for everyone on the page that needs it (AI for up to one batch of them)
  const whyTargets = pageLeads.filter((l) => needsWhyUpgrade(l) || profileByApolloId.has(l.apolloPersonId || ""));
  let whyUpdated = 0;

  if (whyTargets.length > 0) {
    const whyAiMax = LEAD_BATCH_SIZE;
    const inputs = whyTargets.map((lead) => ({
      name: lead.name,
      title: lead.title,
      company: lead.company,
      industry: lead.industry ?? "N/A",
      employees: lead.employees ?? 0,
      location: lead.location ?? "N/A",
      hasEmail: lead.hasEmail,
      leadScore: lead.leadScore,
      profileSummary:
        (lead.apolloPersonId && profileByApolloId.get(lead.apolloPersonId)) ||
        extractProfileSummary(lead.rawApolloData as never),
    }));

    const aiSlice = inputs.slice(0, whyAiMax);
    const outreach = await generateLeadReasoningBatch(aiSlice, scoreContext, {
      userId: input.userId,
      searchId: input.searchId,
    });

    for (let i = 0; i < whyTargets.length; i++) {
      const lead = whyTargets[i];
      const reasoning =
        i < aiSlice.length && outreach[i]?.reasoning
          ? outreach[i].reasoning
          : buildLeadWhyReasoning(inputs[i], scoreContext).reasoning;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { reasoning, recommendedApproach: "", whySource: outreach[i]?.source ?? "TEMPLATE" },
      });
      lead.reasoning = reasoning;
      whyUpdated += 1;
    }
  }

  // Re-read page for consistent response
  const refreshed = await prisma.lead.findMany({
    where: { searchId: input.searchId, userId: input.userId, deletedAt: null },
    orderBy: { leadScore: "desc" },
    skip: offset,
    take: limit,
  });

  return {
    leads: refreshed.map(mapLeadToRecord),
    enriched: enrichedCount,
    whyUpdated,
    emailsUnlocked,
  };
}
