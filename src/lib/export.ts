import type { ScoredLead } from "./types";
import { deriveMatchSignals } from "./lead-signals";
import { emailConfidence, emailConfidenceLabel } from "./email-confidence";
import { BRAND } from "@/config/brand";

/** ScoredLead plus the structured location an ATS import needs. */
export type ExportLead = ScoredLead & {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** Short label for the search the lead came from, e.g. "ai-engineer-lahore". */
  searchTag?: string | null;
};

export type CsvFormat = "standard" | "ats";

/** Byte order mark: without it Excel reads UTF-8 as ANSI and breaks names like "Muñoz". */
const UTF8_BOM = "﻿";

/** Cells starting with these run as formulas in Excel/Sheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (FORMULA_START.test(str)) str = `'${str}`;
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCSV).join(","));
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

/** Empty instead of placeholder values, so an import doesn't store "N/A" or 0 as data. */
function blank(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return /^(n\/a|null|undefined)$/i.test(trimmed) ? "" : trimmed;
}

function blankNumber(value: number | null | undefined): number | string {
  return value && value > 0 ? value : "";
}

function matchSignals(lead: ScoredLead): string {
  return deriveMatchSignals({
    reasoning: lead.reasoning,
    hasEmail: Boolean(lead.hasEmail),
    email: lead.email,
    linkedinUrl: lead.linkedinUrl,
  }).join("; ");
}

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
    "Matched Skills",
    "Missing Skills",
    "Priority",
    "Match Signals",
    "Why Reach Out",
    "Customized Email Draft",
    "Created At",
  ];

  const rows = leads.map((lead) => [
    lead.name,
    lead.title,
    lead.company,
    blank(lead.industry),
    blankNumber(lead.employees),
    blank(lead.location),
    lead.email || "",
    emailConfidenceLabel(emailConfidence(lead.email, lead.emailStatus)),
    lead.linkedinUrl || "",
    lead.score,
    (lead.matchedSkills ?? []).join(", "),
    (lead.missingSkills ?? []).join(", "),
    lead.priority,
    matchSignals(lead),
    lead.reasoning,
    lead.recommendedApproach || "",
    lead.createdAt,
  ]);

  return toCsv(headers, rows);
}

export const ATS_HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Current Title",
  "Current Company",
  "City",
  "State",
  "Country",
  "LinkedIn URL",
  "Source",
  "Tags",
  "Notes",
];

/** The last word is the last name; everything before it is the first name. */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = blank(fullName).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/**
 * Fallback when the profile has no structured location: "City, State, Country",
 * or "City, ST" for a two-letter state code, or "City, Country".
 */
export function splitLocation(location: string | null | undefined): {
  city: string;
  state: string;
  country: string;
} {
  const parts = blank(location)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: "", state: "", country: "" };
  if (parts.length === 1) return { city: "", state: "", country: parts[0] };
  if (parts.length === 2) {
    return /^[A-Z]{2}$/.test(parts[1])
      ? { city: parts[0], state: parts[1], country: "" }
      : { city: parts[0], state: "", country: parts[1] };
  }
  return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
}

export function slugify(value: string, maxLength: number): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

function httpsUrl(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed.replace(/^http:\/\//i, "https://"));
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function singleLine(value: string, maxLength: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
}

export function leadsToAtsCSV(leads: ExportLead[]): string {
  const rows = leads.map((lead) => {
    const { first, last } = splitName(lead.name);
    const fallback = splitLocation(lead.location);
    const city = blank(lead.city) || fallback.city;
    const state = blank(lead.state) || fallback.state;
    const country = blank(lead.country) || fallback.country;
    // Only verified emails: an ATS treats every imported address as real.
    const verified = emailConfidence(lead.email, lead.emailStatus) === "verified";
    const tags = [BRAND.slug, lead.searchTag].filter(Boolean).join(";");
    const reason = blank(lead.reasoning);
    const score = lead.score > 0 ? lead.score : "";

    return [
      first,
      last,
      verified ? blank(lead.email) : "",
      "",
      blank(lead.title),
      blank(lead.company),
      city,
      state,
      country,
      httpsUrl(lead.linkedinUrl),
      "Versa",
      tags,
      score === "" ? "" : singleLine(`Score ${score}/10${reason ? ` – ${reason}` : ""}`, 300),
    ];
  });

  return toCsv(ATS_HEADERS, rows);
}

export async function leadsToExcelBuffer(leads: ScoredLead[]): Promise<Buffer> {
  const XLSX = await import("xlsx");

  const data = leads.map((lead) => ({
    Name: lead.name,
    Title: lead.title,
    Company: lead.company,
    Industry: blank(lead.industry),
    Employees: blankNumber(lead.employees),
    Location: blank(lead.location),
    Email: lead.email || "",
    "Email Status": emailConfidenceLabel(emailConfidence(lead.email, lead.emailStatus)),
    LinkedIn: lead.linkedinUrl || "",
    Score: lead.score,
    "Matched Skills": (lead.matchedSkills ?? []).join(", "),
    "Missing Skills": (lead.missingSkills ?? []).join(", "),
    Priority: lead.priority,
    "Match Signals": matchSignals(lead),
    "Why Reach Out": lead.reasoning,
    "Customized Email Draft": lead.recommendedApproach || "",
    "Created At": lead.createdAt,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}
