/**
 * End-to-end smoke test for the lead pipeline, without the browser.
 *
 *   npx tsx scripts/smoke-search.ts "software engineers in Lahore" [leadCount]
 *
 * Runs the real flow: parse -> clarification check -> search -> unlock ->
 * verified filter -> AI Why -> save, then prints what actually landed.
 * It spends real provider credits, bounded by LEAD_UNLOCK_ATTEMPTS_PER_RUN.
 */
import { prisma } from "@/lib/db/prisma";
import {
  previewFindClarification,
  runFindLeadsJob,
  startFindLeadsWorkflow,
  type FindLeadsInput,
} from "@/lib/services/leads/findLeadsWorkflow";
import { emailConfidence } from "@/lib/email-confidence";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const rest = args.filter((a) => a !== "--dry");
  const prompt = rest[0];
  const requestedLeadCount = Number(rest[1]) || undefined;

  if (!prompt) {
    console.error('Usage: npx tsx scripts/smoke-search.ts "<prompt>" [leadCount] [--dry]');
    console.error("  --dry  parse and show filters only, spends no contact credits");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("No user in the database, sign in through the app once first.");
    process.exit(1);
  }

  const input: FindLeadsInput = { prompt, inputType: "prompt", requestedLeadCount };

  console.log("\n1. CLARIFICATION");
  const preview = await previewFindClarification(user, input);
  console.log("   needsClarification:", preview.clarification.needsClarification);
  for (const question of preview.clarification.questions) {
    console.log(`   [${question.id}] ${question.prompt}`);
    console.log(`      options: ${question.options.join(" | ")}`);
  }
  if (preview.clarification.message) console.log("   message:", preview.clarification.message);
  console.log("   credits remaining:", preview.leadsRemaining);

  if (preview.clarification.needsClarification) {
    console.log("\nPrompt needs answers first, re-run with a more specific prompt.");
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log("\n2. FILTERS (dry run, no credits spent)");
    console.log(JSON.stringify(preview.criteria.apollo, null, 2));
    console.log("   industry:", preview.criteria.industry);
    await prisma.$disconnect();
    return;
  }

  console.log("\n2. SEARCH");
  const started = await startFindLeadsWorkflow(user, { ...input, skipClarification: true });
  console.log("   searchId:", started.searchId, "| batchSize:", started.batchSize);

  await runFindLeadsJob(user, { ...input, skipClarification: true }, started.searchId, {
    prompt: started.prompt,
    parseProvider: started.parseProvider,
    criteria: started.rawCriteria,
  });

  const search = await prisma.leadSearch.findUnique({
    where: { id: started.searchId },
    select: { status: true, totalAvailable: true, leadsReturned: true, relaxNote: true },
  });

  console.log("\n3. RESULT");
  console.log("   status:", search?.status, "| pool:", search?.totalAvailable, "| saved:", search?.leadsReturned);
  console.log("   note:", search?.relaxNote);

  const leads = await prisma.lead.findMany({
    where: { searchId: started.searchId },
    select: { email: true, emailStatus: true, location: true, reasoning: true },
  });

  const verified = leads.filter((l) => emailConfidence(l.email, l.emailStatus) === "verified").length;
  const uniqueWhy = new Set(leads.map((l) => (l.reasoning || "").slice(0, 80))).size;

  console.log(`   saved leads: ${leads.length} (verified emails: ${verified})`);
  console.log(`   distinct Why openings: ${uniqueWhy} of ${leads.length}, 1 means the AI Why did not run`);
  console.log(`   distinct locations: ${new Set(leads.map((l) => l.location)).size}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("\nSMOKE FAILED:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
