/**
 * Load existing leads into the shared lead pool (LeadPoolPerson).
 *
 *   npx tsx scripts/import-lead-pool.ts [--from-leads] [file.csv ...] [--commit]
 *
 *   --from-leads  every Lead row already saved by any user's searches
 *   file.csv      exports from the Serper pipeline, the Apollo collector, the
 *                 Open-to-Work finder or raw Apollo search exports
 *                 (the format is detected from the header row)
 *
 * Runs as a dry run unless --commit is passed. Safe to run repeatedly: people
 * are matched by Apollo id or LinkedIn URL and merged, never duplicated.
 */
import { readFileSync } from "fs";
import { prisma } from "@/lib/db/prisma";
import { poolInputFromCsvRow, splitLocation, type PoolPersonInput } from "@/lib/lead-pool";
import { upsertPoolPeople } from "@/lib/services/leads/leadPool";
import { parseCsv } from "@/lib/screenshot/leadSource";

function readCsv(path: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  if (!header) return [];
  return rows
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => Object.fromEntries(header.map((name, i) => [name.trim(), cells[i] ?? ""])));
}

async function leadsFromDatabase(): Promise<PoolPersonInput[]> {
  const leads = await prisma.lead.findMany({ where: { deletedAt: null } });
  return leads.map((lead) => ({
    apolloPersonId: lead.apolloPersonId,
    linkedinUrl: lead.linkedinUrl,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry,
    employees: lead.employees,
    ...splitLocation(lead.location),
    location: lead.location,
    email: lead.email,
    emailStatus: lead.emailStatus,
    // A saved email means Apollo was already asked for it.
    emailChecked: lead.hasEmail,
    source: "user_search",
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const files = args.filter((arg) => !arg.startsWith("--"));

  const inputs: PoolPersonInput[] = [];
  if (args.includes("--from-leads")) {
    const fromLeads = await leadsFromDatabase();
    console.log(`Lead table: ${fromLeads.length} rows`);
    inputs.push(...fromLeads);
  }
  for (const file of files) {
    const rows = readCsv(file);
    const mapped = rows.map(poolInputFromCsvRow).filter((row): row is PoolPersonInput => row !== null);
    console.log(
      mapped.length
        ? `${file}: ${rows.length} rows, ${mapped.length} usable (${mapped[0].source})`
        : `${file}: ${rows.length} rows, none usable (no Apollo id or LinkedIn URL, or format not recognised)`
    );
    inputs.push(...mapped);
  }

  if (inputs.length === 0) {
    console.log("Nothing to import. Pass --from-leads and/or CSV files.");
    return;
  }

  const before = await prisma.leadPoolPerson.count();
  if (!commit) {
    console.log(`\nDry run: ${inputs.length} records ready. Pool currently has ${before}. Re-run with --commit to write.`);
    return;
  }

  const { created, updated } = await upsertPoolPeople(inputs);
  const after = await prisma.leadPoolPerson.count();
  console.log(`\nCreated ${created}, updated ${updated}. Pool size: ${before} -> ${after}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
