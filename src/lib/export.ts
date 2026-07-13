import type { ScoredLead } from "./types";
import { deriveMatchSignals } from "./lead-signals";

export function leadsToCSV(leads: ScoredLead[]): string {
  const headers = [
    "Name",
    "Title",
    "Company",
    "Industry",
    "Employees",
    "Location",
    "Email",
    "Email Status",
    "LinkedIn",
    "Score",
    "Priority",
    "Match Signals",
    "Why Reach Out",
    "Created At",
  ];

  const rows = leads.map((lead) =>
    [
      lead.name,
      lead.title,
      lead.company,
      lead.industry,
      lead.employees,
      lead.location,
      lead.email || "",
      lead.hasEmail || lead.email ? "Verified" : "Missing",
      lead.linkedinUrl || "",
      lead.score,
      lead.priority,
      deriveMatchSignals({
        reasoning: lead.reasoning,
        hasEmail: Boolean(lead.hasEmail),
        email: lead.email,
        linkedinUrl: lead.linkedinUrl,
      }).join("; "),
      lead.reasoning,
      lead.createdAt,
    ]
      .map(escapeCSV)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function leadsToExcelBuffer(leads: ScoredLead[]): Promise<Buffer> {
  const XLSX = await import("xlsx");

  const data = leads.map((lead) => ({
    Name: lead.name,
    Title: lead.title,
    Company: lead.company,
    Industry: lead.industry,
    Employees: lead.employees,
    Location: lead.location,
    Email: lead.email || "",
    "Email Status": lead.hasEmail || lead.email ? "Verified" : "Missing",
    LinkedIn: lead.linkedinUrl || "",
    Score: lead.score,
    Priority: lead.priority,
    "Match Signals": deriveMatchSignals({
      reasoning: lead.reasoning,
      hasEmail: Boolean(lead.hasEmail),
      email: lead.email,
      linkedinUrl: lead.linkedinUrl,
    }).join("; "),
    "Why Reach Out": lead.reasoning,
    "Created At": lead.createdAt,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}
