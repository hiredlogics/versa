/**
 * Parse the same prompt twice and assert Apollo filters stay stable.
 * Run: npx tsx scripts/test-parse-stability.ts
 */
import fs from "fs";
import path from "path";

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

const PROMPT =
  "Find software engineers in California who are open to work / looking for a job";

async function main() {
  if (!process.env.OPENAI_API_KEY?.startsWith("sk-")) {
    console.error("FAIL: OPENAI_API_KEY missing");
    process.exit(1);
  }

  const { parsePromptWithAi } = await import("../src/lib/services/ai/parsePrompt");
  const { chunkLeadsForScoring, SCORE_BATCH_SIZE } = await import(
    "../src/lib/services/ai/scoreLead"
  );

  const run1 = await parsePromptWithAi(PROMPT);
  const run2 = await parsePromptWithAi(PROMPT);

  const t1 = run1.criteria.apollo?.personTitles ?? [];
  const t2 = run2.criteria.apollo?.personTitles ?? [];
  const l1 = run1.criteria.apollo?.personLocations ?? [];
  const l2 = run2.criteria.apollo?.personLocations ?? [];

  console.log("RUN 1 titles:", t1.join(", "));
  console.log("RUN 2 titles:", t2.join(", "));
  console.log("RUN 1 locations:", l1.join(", "));
  console.log("RUN 2 locations:", l2.join(", "));
  console.log("RUN 1 openToWork:", run1.criteria.openToWork);
  console.log("RUN 2 openToWork:", run2.criteria.openToWork);
  console.log("RUN 1 q_keywords:", run1.criteria.apollo?.qKeywords ?? null);
  console.log("RUN 2 q_keywords:", run2.criteria.apollo?.qKeywords ?? null);
  console.log("SCORE_BATCH_SIZE:", SCORE_BATCH_SIZE);
  console.log("Chunks for 99 leads:", chunkLeadsForScoring(Array(99).fill(0)).length);

  const errors: string[] = [];
  if (JSON.stringify(t1) !== JSON.stringify(t2)) {
    errors.push(`titles differ:\n  ${t1.join(" | ")}\n  ${t2.join(" | ")}`);
  }
  if (JSON.stringify(l1) !== JSON.stringify(l2)) {
    errors.push(`locations differ: ${l1} vs ${l2}`);
  }
  if (run1.criteria.openToWork !== true || run2.criteria.openToWork !== true) {
    errors.push("openToWork should be true for both runs");
  }
  if (run1.criteria.apollo?.qKeywords?.toLowerCase().includes("open to work") !== true ||
      run2.criteria.apollo?.qKeywords?.toLowerCase().includes("open to work") !== true) {
    errors.push('open-to-work searches should bias q_keywords with "open to work"');
  }
  if (!t1.includes("Software Engineer") || !t1.includes("Developer")) {
    errors.push(`stable engineer titles missing: ${t1.join(", ")}`);
  }
  if (chunkLeadsForScoring(Array(99).fill(0)).length < 2) {
    errors.push("99 leads should split into multiple score batches");
  }

  if (errors.length) {
    console.log("\nFAIL");
    for (const e of errors) console.log(" -", e);
    process.exit(1);
  }

  console.log("\nPASS: same prompt → stable Apollo titles/location across two parses");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
