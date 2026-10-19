/**
 * Checks that AI scores rank people the way a person would for the same search.
 * Real OpenAI calls, no Apollo credits. Each prompt goes through the real parser.
 *
 * Run: npx tsx scripts/eval-lead-scoring.ts [cases.json]
 * Default cases: scripts/fixtures/lead-scoring.sample.json
 *
 * Each case lists people and "pairs": [higherId, lowerId] means the first must
 * score above the second. These pairs are the closest thing we have to ground truth.
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

type Person = {
  id: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  location: string;
  headline?: string;
  hasEmail?: boolean;
};

type Case = { name: string; prompt: string; people: Person[]; pairs: Array<[string, string]> };

async function main() {
  const { scoreLeadsWithAi } = await import("../src/lib/services/ai/scoreLead");
  const { parsePromptWithAi } = await import("../src/lib/services/ai/parsePrompt");
  const file = process.argv[2] ?? path.join("scripts", "fixtures", "lead-scoring.sample.json");
  const cases = JSON.parse(fs.readFileSync(file, "utf8")) as Case[];

  let passed = 0;
  let total = 0;

  for (const c of cases) {
    const { criteria } = await parsePromptWithAi(c.prompt);
    const result = await scoreLeadsWithAi(
      c.people.map((p) => ({ ...p, name: p.id, hasEmail: p.hasEmail ?? true })),
      {
        originalPrompt: c.prompt,
        searchIntent: criteria.searchIntent,
        keywords: criteria.keywords,
        targetTitles: criteria.apollo?.personTitles ?? criteria.jobTitles ?? [],
        openToWork: criteria.openToWork,
        compareAcrossLeads: true,
      },
      undefined,
      { ignoreCap: true }
    );

    const scoreById = new Map(c.people.map((p, i) => [p.id, result.scores[i]]));
    console.log(`\n${c.name}  (scored by ${result.provider})`);
    for (const p of c.people) {
      const s = scoreById.get(p.id)!;
      console.log(`  ${String(s.leadScore).padStart(2)}  ${p.title} @ ${p.company}`);
      if (s.pros?.length) console.log(`        + ${s.pros.join(" | ")}`);
      if (s.cons?.length) console.log(`        - ${s.cons.join(" | ")}`);
    }
    for (const [higher, lower] of c.pairs) {
      const hi = scoreById.get(higher)!.leadScore;
      const lo = scoreById.get(lower)!.leadScore;
      const ok = hi > lo;
      total += 1;
      if (ok) passed += 1;
      const name = (id: string) => c.people.find((p) => p.id === id)!.title;
      console.log(`  ${ok ? "ok  " : "MISS"} ${name(higher)} (${hi}) above ${name(lower)} (${lo})`);
    }
  }

  console.log(`\nRanking checks passed: ${passed}/${total}`);
  if (passed < total) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
