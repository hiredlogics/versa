import { describe, expect, it } from "vitest";
import type { Lead } from "@prisma/client";
import {
  ATS_HEADERS,
  escapeCSV,
  leadsToAtsCSV,
  leadsToCSV,
  splitLocation,
  splitName,
  type ExportLead,
} from "@/lib/export";
import { parseCsv } from "@/lib/csv";
import { dbLeadToExport, searchTagFor } from "@/lib/services/leads/exportLeads";

function lead(overrides: Partial<ExportLead> = {}): ExportLead {
  return {
    id: "lead-1",
    name: "Maria Muñoz",
    title: "Data Engineer",
    company: "Acme",
    industry: "Software",
    employees: 120,
    location: "Austin, TX, United States",
    email: "maria@acme.com",
    emailStatus: "verified",
    linkedinUrl: "https://www.linkedin.com/in/maria",
    score: 8,
    reasoning: "Strong match for the role.",
    priority: "High",
    createdAt: "2026-10-05T10:00:00.000Z",
    ...overrides,
  };
}

/** Parse our own output back, dropping the BOM and the trailing empty line. */
function rows(csv: string): string[][] {
  return parseCsv(csv.replace(/^﻿/, "").replace(/\r\n/g, "\n")).filter(
    (row) => row.length > 1 || row[0] !== ""
  );
}

describe("CSV writer", () => {
  it("starts with a UTF-8 BOM and uses CRLF line endings", () => {
    const csv = leadsToCSV([lead()]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("neutralises cells that would run as spreadsheet formulas", () => {
    expect(escapeCSV("=SUM(1,2)")).toBe(`"'=SUM(1,2)"`);
    expect(escapeCSV("+1")).toBe("'+1");
    expect(escapeCSV("-1")).toBe("'-1");
    expect(escapeCSV("@cmd")).toBe("'@cmd");
    expect(escapeCSV("Plain text")).toBe("Plain text");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(escapeCSV('Says "hi", then')).toBe(`"Says ""hi"", then"`);
    expect(escapeCSV("two\nlines")).toBe(`"two\nlines"`);
    expect(escapeCSV("cr\rhere")).toBe(`"cr\rhere"`);
    expect(escapeCSV(null)).toBe("");
  });

  it("writes empty cells instead of N/A or 0", () => {
    const [, row] = rows(leadsToCSV([lead({ industry: "N/A", employees: 0, location: "N/A" })]));
    expect(row[3]).toBe("");
    expect(row[4]).toBe("");
    expect(row[5]).toBe("");
  });

  it("exports Matched Skills and Missing Skills columns", () => {
    const [header, row1] = rows(
      leadsToCSV([
        lead({
          matchedSkills: ["Spark", "AWS"],
          missingSkills: ["Airflow"],
        }),
      ])
    );
    expect(header[10]).toBe("Matched Skills");
    expect(header[11]).toBe("Missing Skills");
    expect(row1[10]).toBe("Spark, AWS");
    expect(row1[11]).toBe("Airflow");

    const [, row2] = rows(leadsToCSV([lead()]));
    expect(row2[10]).toBe("");
    expect(row2[11]).toBe("");
  });
});

describe("name and location splitting", () => {
  it("splits names on the last space", () => {
    expect(splitName("Madonna")).toEqual({ first: "Madonna", last: "" });
    expect(splitName("Maria Muñoz")).toEqual({ first: "Maria", last: "Muñoz" });
    expect(splitName("  Maria de la Cruz ")).toEqual({ first: "Maria de la", last: "Cruz" });
  });

  it("splits free-text locations", () => {
    expect(splitLocation("Lahore, Punjab, Pakistan")).toEqual({ city: "Lahore", state: "Punjab", country: "Pakistan" });
    expect(splitLocation("Austin, TX")).toEqual({ city: "Austin", state: "TX", country: "" });
    expect(splitLocation("Berlin, Germany")).toEqual({ city: "Berlin", state: "", country: "Germany" });
    expect(splitLocation("N/A")).toEqual({ city: "", state: "", country: "" });
  });
});

describe("ATS export", () => {
  it("uses the exact ATS header order", () => {
    const [header] = rows(leadsToAtsCSV([lead()]));
    expect(header).toEqual(ATS_HEADERS);
  });

  it("fills a verified lead correctly", () => {
    const [, row] = rows(
      leadsToAtsCSV([lead({ city: "Austin", state: "Texas", country: "United States", searchTag: "data-engineer-austin" })])
    );
    expect(row).toEqual([
      "Maria",
      "Muñoz",
      "maria@acme.com",
      "",
      "Data Engineer",
      "Acme",
      "Austin",
      "Texas",
      "United States",
      "https://www.linkedin.com/in/maria",
      "VARSA",
      "varsa;data-engineer-austin",
      "Score 8/10 – Strong match for the role.",
    ]);
  });

  it("upgrades LinkedIn links to https", () => {
    const [, row] = rows(leadsToAtsCSV([lead({ linkedinUrl: "http://www.linkedin.com/in/maria" })]));
    expect(row[9]).toBe("https://www.linkedin.com/in/maria");
  });

  it("never exports a guessed or unknown email", () => {
    const csv = leadsToAtsCSV([
      lead({ emailStatus: "guessed" }),
      lead({ id: "lead-2", emailStatus: null }),
    ]);
    expect(csv).not.toContain("maria@acme.com");
  });

  it("falls back to the location text and never writes N/A", () => {
    const csv = leadsToAtsCSV([lead({ location: "Lahore, Punjab, Pakistan", industry: "N/A" })]);
    const [, row] = rows(csv);
    expect(row.slice(6, 9)).toEqual(["Lahore", "Punjab", "Pakistan"]);
    expect(csv).not.toContain("N/A");
  });

  it("keeps notes on one line and short", () => {
    const longReason = `${"Very long reason. ".repeat(40)}\nSecond line`;
    const [, row] = rows(leadsToAtsCSV([lead({ reasoning: longReason })]));
    const notes = row[12];
    expect(notes).not.toMatch(/[\r\n]/);
    expect(notes.length).toBeLessThanOrEqual(300);
  });
});

describe("database lead mapping", () => {
  const dbLead = {
    id: "db-1",
    name: "Aun Ali",
    title: "AI/ML Engineer",
    company: "SOFTEC",
    industry: null,
    employees: null,
    location: null,
    email: null,
    emailStatus: null,
    linkedinUrl: null,
    leadScore: 5,
    priorityLevel: "LOW",
    reasoning: null,
    recommendedApproach: null,
    hasEmail: false,
    rawApolloData: { city: "Lahore", state: "Punjab", country: "Pakistan" },
    createdAt: new Date("2026-10-05T00:00:00Z"),
  } as unknown as Lead;

  it("reads structured location from the saved profile and builds a search tag", () => {
    const mapped = dbLeadToExport({
      ...dbLead,
      search: {
        prompt: "Lead search request (combine all lines into ONE search): ...",
        parsedCriteria: { jobTitles: ["AI Engineer", "ML Engineer"], city: "Lahore", country: "Pakistan" },
      },
    });
    expect(mapped).toMatchObject({ city: "Lahore", state: "Punjab", country: "Pakistan", searchTag: "ai-engineer-lahore" });
    expect(mapped.industry).toBe("");
    expect(mapped.location).toBe("");
  });

  it("has no search tag when the search has no job title", () => {
    expect(searchTagFor({ prompt: "x", parsedCriteria: {} })).toBeNull();
    expect(searchTagFor(null)).toBeNull();
  });
});
