import { prisma } from "@/lib/db/prisma";
import { getApolloSearchConfig, getLeadSearchConfig } from "@/lib/apollo-config";
import { searchAllPeople, formatApolloPerson, enrichPeopleBatch } from "@/lib/apollo";
import { extractProfileSummary, toStoredApolloProfile } from "@/lib/lead-profile";
import { generateLeadReasoningBatch } from "@/lib/services/ai/leadReasoning";
import { assertApolloConfigured } from "@/lib/platform-readiness";
import { parsePromptWithAi } from "@/lib/services/ai/parsePrompt";
import { scoreLeadsWithAi, toDbPriority } from "@/lib/services/ai/scoreLead";
import {
  incrementUsage,
  requireLeadSearchAccess,
} from "@/lib/services/billing/usageLimits";
import { mapLeadToRecord } from "@/lib/services/searches/searchHistory";
import { getUserLeadContext } from "@/lib/context/userLeadContext";
import {
  buildScoringContextFromLeadContext,
  filterExcludedLeads,
} from "@/lib/context/exclusions";
import type { User, AiProvider } from "@prisma/client";
import type { SearchCriteria } from "@/lib/types";

export interface FindLeadsInput {
  prompt: string;
  inputType?: string;
  linkedinUrl?: string;
  companyUrl?: string;
  companyName?: string;
  minScore?: number;
}

function buildPrompt(input: FindLeadsInput): string {
  if (input.linkedinUrl) {
    return `Find leads similar to this LinkedIn profile: ${input.linkedinUrl}. ${input.prompt || ""}`.trim();
  }
  if (input.companyUrl) {
    return `Find decision makers at companies like ${input.companyUrl}. ${input.prompt || ""}`.trim();
  }
  if (input.companyName) {
    return `Find decision makers at ${input.companyName}. ${input.prompt || ""}`.trim();
  }
  return input.prompt;
}

function sortLeads<T extends { hasEmail: boolean; leadScore: number }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => {
    const emailDiff = Number(b.hasEmail) - Number(a.hasEmail);
    if (emailDiff !== 0) return emailDiff;
    return b.leadScore - a.leadScore;
  });
}

export async function findLeadsWorkflow(user: User, input: FindLeadsInput) {
  assertApolloConfigured();

  const start = Date.now();
  const prompt = buildPrompt(input);
  const leadContext = await getUserLeadContext(user.id);
  const minScore =
    input.minScore ??
    leadContext?.minLeadScore ??
    parseInt(process.env.MIN_LEAD_SCORE || "8", 10);
  const { maxResults, minScore: configMin, requireEmail: requireEmailFilter } = getLeadSearchConfig();
  const effectiveMin = input.minScore ?? leadContext?.minLeadScore ?? configMin ?? minScore;
  const { maxEnrich } = getApolloSearchConfig();

  const requestedMax = maxResults > 0 ? maxResults : undefined;
  const access = await requireLeadSearchAccess(user, requestedMax);
  const maxLeadsCap = access.effectiveMaxLeads;

  const search = await prisma.leadSearch.create({
    data: {
      userId: user.id,
      prompt,
      inputType: input.inputType || "prompt",
      status: "RUNNING",
    },
  });

  try {
    const { criteria, provider: parseProvider } = await parsePromptWithAi(prompt, {
      userId: user.id,
      searchId: search.id,
      leadContext,
    });

    let { people, totalAvailable, apolloRelaxNote } = await searchAllPeople(criteria);

    people = filterExcludedLeads(
      people,
      criteria.excludedTitles ?? leadContext?.excludedTitles ?? [],
      criteria.excludedIndustries ?? leadContext?.excludedIndustries ?? [],
      prompt
    );

    if (people.length === 0) {
      await prisma.leadSearch.update({
        where: { id: search.id },
        data: {
          status: "COMPLETE",
          parsedCriteria: criteria as object,
          apolloFilters: criteria.apollo as object,
          totalAvailable: 0,
          leadsReturned: 0,
          durationMs: Date.now() - start,
          aiProviderUsed: parseProvider as AiProvider,
          relaxNote: apolloRelaxNote,
        },
      });
      await incrementUsage(user.id, 0, 1);
      return { searchId: search.id, leads: [], criteria, message: "No leads found. Try broadening your search." };
    }

    const formatted = people.map((p) => ({
      ...formatApolloPerson(p),
      hasEmail: Boolean(p.has_email || p.email),
    }));

    const scoreContext = buildScoringContextFromLeadContext(
      leadContext,
      {
        searchIntent: criteria.searchIntent,
        keywords: criteria.keywords,
        excludedTitles: criteria.excludedTitles,
        excludedIndustries: criteria.excludedIndustries,
      },
      prompt
    );
    scoreContext.openToWork = criteria.openToWork;
    scoreContext.requireEmail = criteria.requireEmail;

    const { scores, provider: scoreProvider } = await scoreLeadsWithAi(
      formatted,
      scoreContext,
      { userId: user.id, searchId: search.id }
    );

    let combined = formatted.map((lead, i) => ({
      apolloPersonId: lead.id,
      name: lead.name,
      title: lead.title,
      company: lead.company,
      industry: lead.industry,
      employees: lead.employees,
      location: lead.location,
      email: lead.email,
      linkedinUrl: lead.linkedinUrl,
      hasEmail: lead.hasEmail,
      leadScore: scores[i].leadScore,
      priorityLevel: toDbPriority(scores[i].priorityLevel),
      reasoning: scores[i].reasoning,
      recommendedApproach: scores[i].recommendedApproach,
    }));

    combined = sortLeads(combined.filter((l) => l.leadScore >= effectiveMin));

    if (requireEmailFilter && criteria.requireEmail) {
      const withEmail = combined.filter((l) => l.email || l.hasEmail);
      if (withEmail.length >= 3) combined = withEmail;
    }

    // Cap early so enrich + email drafts stay fast (defaults ~25 leads)
    const processCap =
      maxResults > 0
        ? Math.min(maxResults, maxLeadsCap || maxResults, maxEnrich)
        : Math.min(maxEnrich, maxLeadsCap || maxEnrich);
    if (processCap > 0) {
      combined = combined.slice(0, processCap);
    }

    console.log(
      `[findLeads] scored=${formatted.length} qualified=${combined.length} (cap=${processCap}) enriching…`
    );

    if (combined.length === 0) {
      await prisma.leadSearch.update({
        where: { id: search.id },
        data: {
          status: "COMPLETE",
          parsedCriteria: criteria as object,
          apolloFilters: criteria.apollo as object,
          totalAvailable,
          leadsReturned: 0,
          durationMs: Date.now() - start,
          aiProviderUsed: (scoreProvider === "HEURISTIC" ? parseProvider : scoreProvider) as AiProvider,
          relaxNote: apolloRelaxNote,
        },
      });
      await incrementUsage(user.id, 0, 1);
      return {
        searchId: search.id,
        leads: [],
        criteria,
        totalAvailable,
        apolloRelaxNote,
        message: "No leads met your score threshold. Try lowering min score or broadening criteria.",
      };
    }

    const toEnrich = people.filter((p) => combined.some((c) => c.apolloPersonId === p.id)).slice(0, maxEnrich);
    const enriched = await enrichPeopleBatch(toEnrich);
    const enrichedMap = new Map(
      enriched.map((result) => [result.person.id, formatApolloPerson(result.person)])
    );
    const enrichedRawMap = new Map(enriched.map((result) => [result.person.id, result.raw]));
    const enrichedProfileMap = new Map(
      enriched.map((result) => [
        result.person.id,
        extractProfileSummary(result.raw),
      ])
    );

    combined = combined.map((lead) => {
      const full = enrichedMap.get(lead.apolloPersonId);
      if (!full) return lead;
      return {
        ...lead,
        name: full.name !== "Unknown" ? full.name : lead.name,
        title: full.title !== "N/A" ? full.title : lead.title,
        company: full.company !== "Unknown" ? full.company : lead.company,
        industry: full.industry !== "N/A" ? full.industry : lead.industry,
        employees: full.employees || lead.employees,
        location: full.location !== "N/A" ? full.location : lead.location,
        email: full.email || lead.email,
        linkedinUrl: full.linkedinUrl || lead.linkedinUrl,
        hasEmail: Boolean(full.email || lead.email),
      };
    });

    const outreachResults = await generateLeadReasoningBatch(
      combined.map((lead) => ({
        name: lead.name,
        title: lead.title,
        company: lead.company,
        industry: lead.industry ?? "N/A",
        employees: lead.employees ?? 0,
        location: lead.location ?? "N/A",
        hasEmail: lead.hasEmail,
        leadScore: lead.leadScore,
        profileSummary: enrichedProfileMap.get(lead.apolloPersonId) ?? null,
      })),
      scoreContext,
      { userId: user.id, searchId: search.id }
    );

    combined = combined.map((lead, index) => {
      const outreach = outreachResults[index];
      if (!outreach) return lead;
      return {
        ...lead,
        reasoning: outreach.reasoning,
        recommendedApproach: outreach.emailDraft,
      };
    });

    combined = sortLeads(combined);

    const saved = await prisma.lead.createMany({
      data: combined.map((lead) => ({
        userId: user.id,
        searchId: search.id,
        apolloPersonId: lead.apolloPersonId,
        name: lead.name,
        title: lead.title,
        company: lead.company,
        industry: lead.industry,
        employees: lead.employees,
        location: lead.location,
        email: lead.email,
        linkedinUrl: lead.linkedinUrl,
        leadScore: lead.leadScore,
        priorityLevel: lead.priorityLevel,
        reasoning: lead.reasoning,
        recommendedApproach: lead.recommendedApproach,
        hasEmail: lead.hasEmail,
        rawApolloData: toStoredApolloProfile(enrichedRawMap.get(lead.apolloPersonId)) ?? undefined,
      })),
    });

    const savedLeads = await prisma.lead.findMany({
      where: { searchId: search.id },
      orderBy: { leadScore: "desc" },
    });

    await incrementUsage(user.id, saved.count, 1);

    await prisma.leadSearch.update({
      where: { id: search.id },
      data: {
        status: "COMPLETE",
        parsedCriteria: criteria as object,
        apolloFilters: criteria.apollo as object,
        totalAvailable,
        leadsReturned: saved.count,
        durationMs: Date.now() - start,
        aiProviderUsed: (scoreProvider === "HEURISTIC" ? parseProvider : scoreProvider) as AiProvider,
        relaxNote: apolloRelaxNote,
      },
    });

    return {
      searchId: search.id,
      leads: savedLeads.map(mapLeadToRecord),
      criteria,
      totalAvailable,
      apolloRelaxNote,
      message: `Found ${saved.count} qualified leads from ${people.length} Apollo results.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Search failed";
    await prisma.leadSearch.update({
      where: { id: search.id },
      data: { status: "FAILED", errorMessage: msg, durationMs: Date.now() - start },
    });
    throw error;
  }
}
