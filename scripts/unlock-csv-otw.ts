/**
 * Read a local people CSV → prefer open-to-work title/headline signals →
 * unlock up to 10 emails via Apollo (for testing).
 *
 *   npx tsx scripts/unlock-csv-otw.ts path/to/us-people.csv
 *   npx tsx scripts/unlock-csv-otw.ts path/to/us-people.csv --limit 10
 *   npx tsx scripts/unlock-csv-otw.ts path/to/us-people.csv --otw-only
 *   npx tsx scripts/unlock-csv-otw.ts path/to/us-people.csv --dry
 *
 * Expected CSV columns (any casing / common aliases):
 *   linkedin_url  (required for unlock if no apollo_id)
 *   apollo_id     (optional — Apollo person id)
 *   title, headline
 *   first_name, last_name  (or name)
 *   country / location     (optional — keeps US rows when present)
 *
 * Writes: data/unlock-csv-otw-result.csv  (gitignored under /data/)
 * Spends real Apollo contact credits — default unlock cap is 10.
 */
import fs from "fs";
import path from "path";
import {
  hasOpenToWorkTitleSignal,
  OPEN_TO_WORK_TITLE_SIGNALS,
} from "../src/lib/open-to-work";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(process.cwd(), ".env.local"));

type CsvRow = Record<string, string>;

type Candidate = {
  rowIndex: number;
  apolloId: string | null;
  linkedinUrl: string | null;
  firstName: string;
  lastName: string;
  title: string;
  headline: string;
  country: string;
  location: string;
  otw: boolean;
};

function parseArgs(argv: string[]) {
  let limit = 10;
  let otwOnly = false;
  let dry = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--otw-only") {
      otwOnly = true;
      continue;
    }
    if (a === "--dry") {
      dry = true;
      continue;
    }
    if (a === "--limit") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n)) {
        limit = n;
        i++;
      }
      continue;
    }
    if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (Number.isFinite(n)) limit = n;
      continue;
    }
    if (a.startsWith("--")) continue;
    positional.push(a);
  }

  return {
    csvPath: positional[0],
    limit: Math.max(1, Math.min(limit, 50)),
    otwOnly,
    dry,
  };
}

/** Minimal CSV parser (handles quoted fields). */
function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (cols[i] ?? "").trim();
    }
    return obj;
  });
}

function pick(row: CsvRow, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find((k) => k.toLowerCase().replace(/[\s_]+/g, "") === alias);
    if (found && row[found]) return row[found].trim();
  }
  return "";
}

function normalizeLinkedIn(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t.split("?")[0];
  if (/linkedin\.com\//i.test(t)) return `https://${t.replace(/^\/+/, "")}`.split("?")[0];
  if (/^[a-z0-9-]+$/i.test(t)) return `https://www.linkedin.com/in/${t}`;
  return null;
}

function isUsRow(c: Candidate): boolean {
  const blob = `${c.country} ${c.location}`.toLowerCase();
  if (!blob.trim()) return true; // no geo column → keep
  return (
    /\bunited states\b/.test(blob) ||
    /\busa\b/.test(blob) ||
    /\bu\.s\.a\.?\b/.test(blob) ||
    /(^|[^a-z])us([^a-z]|$)/.test(blob)
  );
}

function hasOtwSignal(title: string, headline: string): boolean {
  if (hasOpenToWorkTitleSignal(title) || hasOpenToWorkTitleSignal(headline)) return true;
  const text = `${title} ${headline}`.toLowerCase();
  return OPEN_TO_WORK_TITLE_SIGNALS.some((s) => text.includes(s));
}

function toCandidate(row: CsvRow, rowIndex: number): Candidate | null {
  const linkedinUrl = normalizeLinkedIn(
    pick(row, ["linkedinurl", "linkedin", "linkedinprofile", "profileurl", "liurl"])
  );
  const apolloId = pick(row, ["apolloid", "personid", "id", "apollopersonid"]) || null;
  if (!linkedinUrl && !apolloId) return null;

  const firstName = pick(row, ["firstname", "first"]);
  const lastName = pick(row, ["lastname", "last"]);
  const name = pick(row, ["name", "fullname"]);
  const title = pick(row, ["title", "jobtitle", "position"]);
  const headline = pick(row, ["headline", "about", "summary", "linkedinheadline"]);

  return {
    rowIndex,
    apolloId: apolloId && apolloId.length > 5 ? apolloId : null,
    linkedinUrl,
    firstName: firstName || name.split(/\s+/)[0] || "",
    lastName: lastName || name.split(/\s+/).slice(1).join(" ") || "",
    title,
    headline,
    country: pick(row, ["country"]),
    location: pick(row, ["location", "city", "state", "region", "geo"]),
    otw: hasOtwSignal(title, headline),
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main() {
  const { csvPath, limit, otwOnly, dry } = parseArgs(process.argv.slice(2));

  if (!csvPath) {
    console.error(`Usage: npx tsx scripts/unlock-csv-otw.ts <path-to.csv> [--limit 10] [--otw-only] [--dry]

CSV needs linkedin_url and/or apollo_id. Optional: title, headline, first_name, last_name, country.
--otw-only  only unlock rows with open-to-work wording in title/headline
--dry       scan CSV only — spend no Apollo credits`);
    process.exit(1);
  }

  const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(abs)) {
    console.error(`CSV not found: ${abs}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(abs, "utf8"));
  console.log(`Loaded ${rows.length} rows from ${abs}`);

  const candidates = rows
    .map((r, i) => toCandidate(r, i + 2)) // +2 = header is line 1
    .filter((c): c is Candidate => c !== null)
    .filter(isUsRow);

  const otw = candidates.filter((c) => c.otw);
  const pool = otwOnly ? otw : [...otw, ...candidates.filter((c) => !c.otw)];
  const unique = new Map<string, Candidate>();
  for (const c of pool) {
    const key = (c.apolloId || c.linkedinUrl || "").toLowerCase();
    if (!key || unique.has(key)) continue;
    unique.set(key, c);
  }
  const selected = [...unique.values()].slice(0, limit);

  console.log(`US-parseable rows: ${candidates.length}`);
  console.log(`Open-to-work title/headline signals: ${otw.length}`);
  console.log(`Selected for unlock: ${selected.length} (limit=${limit}, otwOnly=${otwOnly})`);
  for (const c of selected) {
    console.log(
      `  [${c.otw ? "OTW" : "—"}] ${c.firstName} ${c.lastName} | ${c.title || c.headline || "(no title)"} | ${c.linkedinUrl || c.apolloId}`
    );
  }

  if (selected.length === 0) {
    console.error(
      otwOnly
        ? "No rows with open-to-work wording. Add title/headline signals or drop --otw-only."
        : "No rows with linkedin_url or apollo_id."
    );
    process.exit(1);
  }

  if (dry) {
    console.log("\n--dry: no Apollo unlock.");
    return;
  }

  if (!process.env.APOLLO_API_KEY) {
    console.error("APOLLO_API_KEY missing — set it in .env.local");
    process.exit(1);
  }

  const { enrichPerson, enrichPersonByLinkedIn, isUsableEmail } = await import(
    "../src/lib/apollo"
  );

  type OutRow = {
    name: string;
    title: string;
    headline: string;
    linkedin_url: string;
    email: string;
    email_status: string;
    otw_signal: string;
    unlock_ok: string;
  };

  const out: OutRow[] = [];
  let unlocked = 0;

  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    process.stdout.write(`Unlock ${i + 1}/${selected.length}… `);
    let result = c.apolloId ? await enrichPerson(c.apolloId) : null;
    if (!result && c.linkedinUrl) {
      result = await enrichPersonByLinkedIn(c.linkedinUrl);
    }

    const person = result?.person;
    const email = person && isUsableEmail(person.email) ? person.email!.trim() : "";
    const ok = Boolean(email);
    if (ok) unlocked += 1;
    console.log(ok ? `OK ${email}` : "no usable email");

    out.push({
      name: person
        ? `${person.first_name} ${person.last_name}`.trim()
        : `${c.firstName} ${c.lastName}`.trim(),
      title: person?.title || c.title,
      headline: c.headline,
      linkedin_url: person?.linkedin_url || c.linkedinUrl || "",
      email,
      email_status: person?.email_status || "",
      otw_signal: c.otw ? "yes" : "no",
      unlock_ok: ok ? "yes" : "no",
    });

    if (i + 1 < selected.length) await new Promise((r) => setTimeout(r, 150));
  }

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, "unlock-csv-otw-result.csv");
  const headers = [
    "name",
    "title",
    "headline",
    "linkedin_url",
    "email",
    "email_status",
    "otw_signal",
    "unlock_ok",
  ] as const;
  const lines = [
    headers.join(","),
    ...out.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log(`\nUnlocked usable emails: ${unlocked}/${selected.length}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
