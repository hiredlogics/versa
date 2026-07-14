import { prisma } from "@/lib/db/prisma";
import { leadsToCSV, leadsToExcelBuffer } from "@/lib/export";
import type { ScoredLead } from "@/lib/types";
import type { Lead } from "@prisma/client";

export function dbLeadToExport(lead: Lead): ScoredLead {
  return {
    id: lead.id,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry || "N/A",
    employees: lead.employees || 0,
    location: lead.location || "N/A",
    email: lead.email,
    linkedinUrl: lead.linkedinUrl,
    score: lead.leadScore,
    reasoning: lead.reasoning || "",
    recommendedApproach: lead.recommendedApproach,
    priority: mapPriority(lead.priorityLevel),
    hasEmail: lead.hasEmail,
    createdAt: lead.createdAt.toISOString(),
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
}) {
  const leads = await prisma.lead.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
      ...(params.searchId ? { searchId: params.searchId } : {}),
    },
    orderBy: { leadScore: "desc" },
  });

  if (leads.length === 0) return null;

  await prisma.exportLog.create({
    data: {
      userId: params.userId,
      searchId: params.searchId,
      format: params.format,
      leadCount: leads.length,
    },
  });

  const exportLeads = leads.map(dbLeadToExport);
  if (params.format === "xlsx") {
    return { buffer: await leadsToExcelBuffer(exportLeads), count: leads.length };
  }
  return { csv: leadsToCSV(exportLeads), count: leads.length };
}
