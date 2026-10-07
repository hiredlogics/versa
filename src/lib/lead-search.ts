import { parseSearchPrompt, scoreLeadsBatch } from "./openai";
import { searchAllPeople, formatApolloPerson, enrichPeopleBatch } from "./apollo";
import { getApolloSearchConfig, getLeadSearchConfig } from "./apollo-config";
import { saveSession } from "./storage";
import type { ScoredLead, LeadSearchSession, SearchCriteria } from "./types";
import { randomUUID } from "crypto";

function buildScoredLeads(
  formattedLeads: Array<ReturnType<typeof formatApolloPerson> & { hasEmail: boolean }>,
  scores: Awaited<ReturnType<typeof scoreLeadsBatch>>,
  criteria: SearchCriteria,
  prompt: string
): ScoredLead[] {
  return formattedLeads.map((lead, i) => ({
    id: lead.id,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry,
    employees: lead.employees,
    location: lead.location,
    email: lead.email,
    linkedinUrl: lead.linkedinUrl,
    score: scores[i].score,
    reasoning: scores[i].reasoning,
    priority: scores[i].priority,
    openToWork: criteria.openToWork,
    hasEmail: lead.hasEmail,
    searchPrompt: prompt,
    searchTitle: criteria.summary,
    createdAt: new Date().toISOString(),
  }));
}

function sortLeads(leads: ScoredLead[]): ScoredLead[] {
  return [...leads].sort((a, b) => {
    const emailDiff = Number(b.hasEmail) - Number(a.hasEmail);
    if (emailDiff !== 0) return emailDiff;
    return b.score - a.score;
  });
}

function filterLeads(
  allScored: ScoredLead[],
  criteria: SearchCriteria,
  minScore: number,
  maxResults: number,
  requireEmailFilter: boolean
): ScoredLead[] {
  let filtered = allScored.filter((lead) => lead.score >= minScore);

  // Open-to-work: Apollo has no OTW filter, ensure we return useful volume
  if (criteria.openToWork) {
    if (filtered.length < 10) {
      filtered = allScored.filter((l) => l.score >= 5);
    }
    if (filtered.length < 5) {
      filtered = sortLeads(allScored);
    } else {
      filtered = sortLeads(filtered);
    }
  } else {
    filtered = sortLeads(filtered);
  }

  if (maxResults > 0) {
    filtered = filtered.slice(0, maxResults);
  }

  // Optionally drop leads without email (off by default, keeps all Apollo results)
  if (requireEmailFilter && criteria.requireEmail && !criteria.openToWork) {
    const withEmail = filtered.filter((l) => l.email || l.hasEmail);
    if (withEmail.length >= 3) filtered = withEmail;
  } else if (criteria.requireEmail && criteria.openToWork) {
    filtered = sortLeads(filtered);
  }

  return filtered;
}

export async function runLeadSearch(
  prompt: string,
  minScore?: number,
  meta?: { conversationId?: string; conversationTitle?: string }
): Promise<{ session: LeadSearchSession; message: string }> {
  const criteria = await parseSearchPrompt(prompt.trim());
  const { minScore: configMinScore, requireEmail: requireEmailFilter } = getLeadSearchConfig();
  const maxResults = 0;
  const effectiveMinScore = criteria.openToWork ? 6 : (minScore ?? configMinScore);
  const { maxEnrich } = getApolloSearchConfig();

  console.log(`[lead-search] Searching Apollo (openToWork=${criteria.openToWork})...`);
  const { people, totalAvailable, apolloRelaxNote } = await searchAllPeople(criteria);
  console.log(`[lead-search] Apollo returned ${people.length} of ${totalAvailable} available people`);

  if (people.length === 0) {
    return {
      session: {
        id: randomUUID(),
        prompt,
        title: criteria.summary,
        criteria,
        leads: [],
        createdAt: new Date().toISOString(),
      },
      message: criteria.openToWork
        ? "No professionals found for those titles/location. Try: *Find software engineers in California* or *Find developers in New York*."
        : "No leads found. Try broadening your search criteria.",
    };
  }

  const formattedLeads = people.map((p) => ({
    ...formatApolloPerson(p),
    hasEmail: Boolean(p.has_email || p.email),
  }));

  console.log(`[lead-search] Scoring ${formattedLeads.length} leads with AI...`);
  const scores = await scoreLeadsBatch(formattedLeads, undefined, {
    openToWork: criteria.openToWork,
    requireEmail: criteria.requireEmail,
    keywords: criteria.keywords,
    searchIntent: criteria.searchIntent,
  });

  const allScored = buildScoredLeads(formattedLeads, scores, criteria, prompt).map((lead) => {
    // Boost: Apollo marks has_email, ensure email holders aren't filtered out
    if (criteria.openToWork && lead.hasEmail && lead.score < 6) {
      return { ...lead, score: 6, reasoning: `${lead.reasoning} (boosted: email available)` };
    }
    return lead;
  });
  let scoredLeads = filterLeads(
    allScored,
    criteria,
    effectiveMinScore,
    maxResults,
    requireEmailFilter
  );

  const droppedByScore = allScored.length - allScored.filter((l) => l.score >= effectiveMinScore).length;
  if (droppedByScore > 0) {
    console.log(`[lead-search] ${droppedByScore} leads dropped (score < ${effectiveMinScore})`);
  }
  if (requireEmailFilter && criteria.requireEmail) {
    const emailOnly = scoredLeads.filter((l) => l.email || l.hasEmail).length;
    console.log(`[lead-search] email filter on, ${emailOnly}/${scoredLeads.length} have email`);
  }

  console.log(
    `[lead-search] ${scoredLeads.length} leads after filter (min score ${effectiveMinScore}, cap=${maxResults || "none"})`
  );

  // Enrich all returned leads for full email/LinkedIn
  if (scoredLeads.length > 0) {
    const enrichLimit = maxResults > 0 ? Math.min(maxEnrich, maxResults) : maxEnrich;
    const toEnrichIds = new Set(scoredLeads.slice(0, enrichLimit).map((l) => l.id));
    const toEnrichPeople = people.filter((p) => toEnrichIds.has(p.id));
    console.log(`[lead-search] Enriching ${toEnrichPeople.length} leads for email...`);
    const enriched = await enrichPeopleBatch(toEnrichPeople);
    const enrichedMap = new Map(
      enriched.map((result) => [result.person.id, formatApolloPerson(result.person)])
    );

    scoredLeads = scoredLeads.map((lead) => {
      const full = enrichedMap.get(lead.id);
      if (!full) return lead;
      return {
        ...lead,
        name: full.name !== "Unknown" ? full.name : lead.name,
        industry: full.industry !== "N/A" ? full.industry : lead.industry,
        employees: full.employees || lead.employees,
        location: full.location !== "N/A" ? full.location : lead.location,
        email: full.email || lead.email,
        linkedinUrl: full.linkedinUrl || lead.linkedinUrl,
        hasEmail: Boolean(full.email || lead.email),
      };
    });

    scoredLeads = sortLeads(scoredLeads);
  }

  const session: LeadSearchSession = {
    id: randomUUID(),
    prompt,
    title: criteria.summary,
    criteria,
    leads: scoredLeads,
    createdAt: new Date().toISOString(),
  };

  saveSession(session, meta);

  const emailCount = scoredLeads.filter((l) => l.email).length;
  const focusLabel = criteria.openToWork ? "professionals" : "leads";

  const message =
    scoredLeads.length > 0
      ? criteria.openToWork
        ? `Searched ${people.length} of ${totalAvailable.toLocaleString()} Apollo results → ${scoredLeads.length} ${focusLabel} (${emailCount} with email). Note: Apollo can't filter "open to work", these are matching professionals ranked by outreach potential.\n\nAsk me to draft outreach emails or LinkedIn messages.`
        : `Searched ${people.length} of ${totalAvailable.toLocaleString()} Apollo results → ${scoredLeads.length} qualified ${focusLabel} (${emailCount} with email).${apolloRelaxNote ? `\n\n${apolloRelaxNote}` : ""}\n\n**Apollo filters used:** ${criteria.apollo?.personTitles?.slice(0, 3).join(", ")}${criteria.apollo?.qKeywords ? ` · keywords: "${criteria.apollo.qKeywords}"` : ""}${criteria.apollo?.personLocations?.length ? ` · ${criteria.apollo.personLocations.join(", ")}` : ""}\n\nAsk me to draft outreach emails or LinkedIn messages.`
      : `Searched ${people.length} professionals but none matched. Try a more specific role or broader location.`;

  return { session, message };
}

export function formatCriteriaSummary(criteria: SearchCriteria): string {
  const parts = [
    criteria.openToWork ? "Open to work" : criteria.industry,
    criteria.country,
    `${criteria.companySizeMin}-${criteria.companySizeMax} employees`,
    criteria.jobTitles.join(", "),
  ];
  if (criteria.requireEmail) parts.push("email preferred");
  return parts.join(" · ");
}
