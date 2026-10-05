/**
 * Turns a layoffs CSV (columns: company,date,source) into data/layoffs.json, which the
 * open-to-work score reads. Fill the CSV by hand from public news; this script never
 * downloads anything. Rebuild/redeploy after importing so the new list ships.
 *
 *   npm run layoffs:import -- path/to/layoffs.csv
 */
import fs from "node:fs";
import path from "node:path";

type LayoffRecord = { company: string; date: string; source?: string };

const OUTPUT = path.resolve(process.cwd(), "data", "layoffs.json");

/** Splits one CSV line, honouring "quoted, values" and "" escapes. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function layoffsFromCsv(csv: string): { records: LayoffRecord[]; skipped: number } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("company") < 0 || col("date") < 0) {
    throw new Error('The CSV needs a header row with "company" and "date" columns.');
  }

  const records: LayoffRecord[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const company = cells[col("company")] ?? "";
    const date = new Date(cells[col("date")] ?? "");
    if (!company || Number.isNaN(date.getTime())) {
      skipped += 1;
      continue;
    }
    const source = col("source") >= 0 ? cells[col("source")] : "";
    records.push({ company, date: date.toISOString().slice(0, 10), ...(source ? { source } : {}) });
  }
  return { records, skipped };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npm run layoffs:import -- path/to/layoffs.csv");
    process.exit(1);
  }
  const { records, skipped } = layoffsFromCsv(fs.readFileSync(input, "utf-8"));
  fs.writeFileSync(OUTPUT, `${JSON.stringify(records, null, 2)}\n`, "utf-8");
  console.log(`Saved ${records.length} layoffs to ${OUTPUT}${skipped ? ` (skipped ${skipped} bad rows)` : ""}.`);
}

if (process.argv[1]?.endsWith("import-layoffs.ts")) main();
