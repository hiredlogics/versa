/**
 * Measure the relevance gate against people you labeled by hand.
 * Real AI calls (OpenAI), no Apollo credits. Each prompt goes through the
 * real parser first, so its fitCriteria are tested too.
 *
 * Run: npx tsx scripts/eval-relevance-gate.ts [labels.json]
 * Default labels: scripts/fixtures/relevance-gate.sample.json
 *
 * Each person has "expected": "keep" | "drop". "drop" means the gate SHOULD
 * reject them. Wrongly dropping a good lead is the worse mistake: it loses a
 * real lead, while a wrong keep only costs one unlock.
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

type LabeledPerson = {
  id: string;
  title: string;
  company: string;
  headline?: string;
  industry?: string;
  employees?: number;
  location?: string;
  expected: "keep" | "drop";
};

type Case = { name: string; prompt: string; people: LabeledPerson[] };

async function main() {
  const { applyRelevanceGate, judgeRelevance } = await import(
    "../src/lib/services/ai/relevanceGate"
  );
  const { parsePromptWithAi } = await import("../src/lib/services/ai/parsePrompt");
  const file = process.argv[2] ?? path.join("scripts", "fixtures", "relevance-gate.sample.json");
  const cases = JSON.parse(fs.readFileSync(file, "utf8")) as Case[];

  let correct = 0;
  let total = 0;
  let wronglyDropped = 0;
  let wronglyKept = 0;

  for (const c of cases) {
    const { criteria } = await parsePromptWithAi(c.prompt);
    const verdicts = await judgeRelevance(
      c.people,
      {
        originalPrompt: c.prompt,
        searchIntent: criteria.searchIntent,
        fitCriteria: criteria.fitCriteria,
        openToWork: criteria.openToWork,
      },
      { searchId: `eval:${c.name}` }
    );
    console.log(`\n${c.name}`);
    const searchTitles = criteria.apollo?.personTitles ?? criteria.jobTitles ?? [];
    // Same rule as production: enforce mode, and a title the search asked for is never dropped.
    const { rejected } = applyRelevanceGate(c.people, verdicts, "enforce", searchTitles);
    const dropped = new Set(rejected.map((p) => p.id));
    console.log(`  titles: ${JSON.stringify(searchTitles)}`);
    console.log(`  fitCriteria: ${JSON.stringify(criteria.fitCriteria ?? [])}`);
    for (const person of c.people) {
      const result = verdicts.get(person.id);
      const actual = dropped.has(person.id) ? "drop" : "keep";
      const ok = actual === person.expected;
      total += 1;
      if (ok) correct += 1;
      else if (actual === "drop") wronglyDropped += 1;
      else wronglyKept += 1;
      console.log(
        `  ${ok ? "ok  " : "MISS"} ${person.title} @ ${person.company}: ${result?.verdict ?? "?"}${result?.verdict === "no" && actual === "keep" ? " (kept: title matches search)" : ""} (${result?.reason || "no reason"})`
      );
    }
  }

  console.log(`\nAccuracy: ${correct}/${total} (${Math.round((correct / Math.max(1, total)) * 100)}%)`);
  console.log(`Good leads wrongly dropped: ${wronglyDropped}  <- keep this at 0 before enforcing`);
  console.log(`Bad leads wrongly kept: ${wronglyKept}`);
  if (wronglyDropped > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
