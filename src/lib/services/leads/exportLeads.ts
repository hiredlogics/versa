import { prisma } from "@/lib/db/prisma";
import {
  leadsToAtsCSV,
  leadsToCSV,
  leadsToExcelBuffer,
  slugify,
  type CsvFormat,
  type ExportLead,
} from "@/lib/export";
import type { ApolloProfileRaw } from "@/lib/lead-profile";
import type { ScoredLead } from "@/lib/types";
import type { Lead, LeadSearch } from "@prisma/client";

type LeadWithSearch = Lead & {
  search?: Pick<LeadSearch, "prompt" | "parsedCriteria"> | null;
};

/** e.g. "ai-engineer-lahore": first target title plus city (or country). */
export function searchTagFor(search: LeadWithSearch["search"]): string | null {
  if (!search) return null;
  const criteria = (search.parsedCriteria ?? {}) as {
    jobTitles?: string[];
    city?: string;
    country?: string;
  };
  const title = criteria.jobTitles?.find((t) => t.trim())?.trim();
  if (!title) return null;
  const place = criteria.city?.trim() || criteria.country?.trim() || "";
  return slugify(`${title} ${place}`, 30) || null;
}

export function dbLeadToExport(lead: LeadWithSearch): ExportLead {
  const profile = (lead.rawApolloData ?? null) as ApolloProfileRaw | null;
  return {
    id: lead.id,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry || "",
    employees: lead.employees || 0,
    location: lead.location || "",
    email: lead.email,
    emailStatus: lead.emailStatus,
    linkedinUrl: lead.linkedinUrl,
    score: lead.leadScore,
    matchedSkills: lead.matchedSkills ?? [],
    missingSkills: lead.missingSkills ?? [],
    reasoning: lead.reasoning || "",
    recommendedApproach: lead.recommendedApproach,
    priority: mapPriority(lead.priorityLevel),
    hasEmail: lead.hasEmail,
    createdAt: lead.createdAt.toISOString(),
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    country: profile?.country ?? null,
    searchTag: searchTagFor(lead.search),
  };
}

function mapPriority(p: string): ScoredLead["priority"] {
  if (p === "VERY_HIGH" || p === "HIGH") return "High";
  if (p === "MEDIUM") return "Medium";
  return "Low";
}

export async function exportUserLeads(params: {
  userId: string;
  searchId?: string;
  format: "csv" | "xlsx";
  csvFormat?: CsvFormat;
}) {
  const leads = await prisma.lead.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
      ...(params.searchId ? { searchId: params.searchId } : {}),
    },
    include: { search: { select: { prompt: true, parsedCriteria: true } } },
    orderBy: { leadScore: "desc" },
  });

  if (leads.length === 0) return null;

  const csvFormat = params.csvFormat ?? "standard";
  await prisma.exportLog.create({
    data: {
      userId: params.userId,
      searchId: params.searchId,
      format: params.format === "csv" && csvFormat === "ats" ? "csv-ats" : params.format,
      leadCount: leads.length,
    },
  });

  const exportLeads = leads.map(dbLeadToExport);
  const fileTag = params.searchId ? searchTagFor(leads[0].search) : null;

  if (params.format === "xlsx") {
    return { buffer: await leadsToExcelBuffer(exportLeads), count: leads.length, fileTag };
  }
  const csv = csvFormat === "ats" ? leadsToAtsCSV(exportLeads) : leadsToCSV(exportLeads);
  return { csv, count: leads.length, fileTag };
}
