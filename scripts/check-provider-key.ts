/**
 * Is the provider key working right now?
 *
 *   npx tsx scripts/check-provider-key.ts
 *
 * Uses the free people-search endpoint only, no email unlock, no credits spent.
 */
import { searchPage } from "@/lib/providers/people-data";

async function main() {
  try {
    const result = await searchPage(
      {
        personTitles: ["Software Engineer"],
        personLocations: ["United States"],
        includeSimilarTitles: false,
      },
      1
    );
    console.log(`OK, key works. Page 1 returned ${result.people.length} people, totalPages ${result.totalPages}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAILED, ${message}`);
    if (/401|invalid api key/i.test(message)) {
      console.log("That is an authentication failure: the key is wrong, revoked, or lacks API access.");
    }
    process.exitCode = 1;
  }
}

void main();
