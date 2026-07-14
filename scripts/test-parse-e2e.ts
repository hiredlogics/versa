/**
 * End-to-end: user prompt → AI parse → Apollo filters (no Apollo credit spend).
 * Run: npx tsx scripts/test-parse-e2e.ts
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

type Case = {
  name: string;
  prompt: string;
  expect: {
    keywordIncludes?: string[];
    keywordExcludes?: string[];
    titleMustIncludeOneOf?: string[];
    titleMustNotInclude?: string[];
    industryIncludes?: string;
    locationIncludes?: string;
  };
};

const CASES: Case[] = [
  {
    name: "real-estate-automation",
    prompt: "Need automation. people in real estate industry in the US at small companies",
    expect: {
      keywordIncludes: ["real estate"],
      keywordExcludes: ["automation"],
      titleMustIncludeOneOf: ["Broker", "Property Manager", "Founder", "CEO", "Investor"],
      titleMustNotInclude: ["CTO", "VP Engineering", "Head of Product"],
      industryIncludes: "real estate",
      locationIncludes: "United States",
    },
  },
  {
    name: "saas-ceos",
    prompt: "Find SaaS CEOs and founders in California with 20-200 employees",
    expect: {
      keywordIncludes: ["saas"],
      titleMustIncludeOneOf: ["CEO", "Founder"],
      industryIncludes: "saas",
      locationIncludes: "California",
    },
  },
  {
    name: "healthcare-directors",
    prompt: "Healthcare directors and VPs of operations in Texas who may need AI tools",
    expect: {
      keywordIncludes: ["healthcare"],
      keywordExcludes: ["ai"],
      titleMustIncludeOneOf: ["Director", "VP", "Vice President", "Operations"],
      locationIncludes: "Texas",
    },
  },
  {
    name: "typo-real-state",
    prompt: "Need automation, just those people have the real state",
    expect: {
      keywordIncludes: ["real estate"],
      keywordExcludes: ["automation"],
      titleMustNotInclude: ["CTO", "VP Engineering"],
    },
  },
];

async function main() {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  if (!key.startsWith("sk-")) {
    console.error("FAIL: OPENAI_API_KEY missing");
    process.exit(1);
  }

  const { parsePromptWithAi } = await import("../src/lib/services/ai/parsePrompt");
  const { buildApolloSearchVariants, formatApolloFiltersLog } = await import(
    "../src/lib/search-criteria"
  );

  let failed = 0;

  for (const testCase of CASES) {
    console.log(`\n======== ${testCase.name} ========`);
    console.log("PROMPT:", testCase.prompt);

    const { criteria, provider } = await parsePromptWithAi(testCase.prompt);
    const filters = criteria.apollo!;
    const variants = buildApolloSearchVariants(criteria);

    console.log("PROVIDER:", provider);
    console.log("FILTERS:\n" + formatApolloFiltersLog(criteria));
    console.log(
      "RELAX ORDER:",
      variants.map((v) => `${v.level}:${v.label} kw=${v.filters.qKeywords ?? "none"}`).join(" | ")
    );

    const kw = (filters.qKeywords || "").toLowerCase();
    const titles = (filters.personTitles || []).map((t) => t.toLowerCase());
    const industry = (criteria.industry || "").toLowerCase();
    const location = (filters.personLocations || []).join(" ").toLowerCase();
    const errors: string[] = [];

    for (const part of testCase.expect.keywordIncludes || []) {
      if (!kw.includes(part.toLowerCase())) {
        errors.push(`qKeywords missing "${part}" (got "${filters.qKeywords}")`);
      }
    }
    for (const part of testCase.expect.keywordExcludes || []) {
      if (kw.includes(part.toLowerCase())) {
        errors.push(`qKeywords should not include "${part}" (got "${filters.qKeywords}")`);
      }
    }
    if (testCase.expect.titleMustIncludeOneOf?.length) {
      const ok = testCase.expect.titleMustIncludeOneOf.some((t) =>
        titles.some((x) => x.includes(t.toLowerCase()))
      );
      if (!ok) {
        errors.push(
          `titles missing one of ${testCase.expect.titleMustIncludeOneOf.join("|")} (got ${filters.personTitles})`
        );
      }
    }
    for (const bad of testCase.expect.titleMustNotInclude || []) {
      if (titles.some((t) => t.includes(bad.toLowerCase()))) {
        errors.push(`titles must not include "${bad}" (got ${filters.personTitles})`);
      }
    }
    if (
      testCase.expect.industryIncludes &&
      !industry.includes(testCase.expect.industryIncludes.toLowerCase())
    ) {
      errors.push(`industry missing "${testCase.expect.industryIncludes}" (got ${criteria.industry})`);
    }
    if (
      testCase.expect.locationIncludes &&
      !location.includes(testCase.expect.locationIncludes.toLowerCase())
    ) {
      errors.push(
        `location missing "${testCase.expect.locationIncludes}" (got ${filters.personLocations})`
      );
    }

    // Employee ranges must be Apollo buckets
    for (const range of filters.employeeRanges || []) {
      if (!/^\d+,\d+$/.test(range)) {
        errors.push(`invalid employee range "${range}"`);
      }
    }

    // Early relax variants must keep industry keyword when one exists
    if (filters.qKeywords) {
      const early = variants.filter((v) => v.level <= 2);
      for (const v of early) {
        if (!v.filters.qKeywords) {
          errors.push(`relax level ${v.level} dropped industry keyword too early`);
        }
      }
    }

    if (!criteria.searchIntent || criteria.searchIntent.length < 10) {
      errors.push("searchIntent too short / missing full understanding");
    }

    if (errors.length) {
      failed += 1;
      console.log("RESULT: FAIL");
      for (const e of errors) console.log("  -", e);
    } else {
      console.log("RESULT: PASS");
    }
  }

  console.log(`\n======== SUMMARY: ${CASES.length - failed}/${CASES.length} passed ========`);
  if (failed > 0) process.exit(1);
  console.log("PASS: prompt → AI → Apollo filter pipeline is healthy");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
