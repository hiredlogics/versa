/**
 * Local smoke test: ChatGPT outreach (why + email draft).
 * Run: npx tsx scripts/test-outreach-local.ts
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
    let value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(process.cwd(), ".env.local"));

async function main() {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  console.log("OPENAI_API_KEY configured:", key.startsWith("sk-") ? "yes" : "no");
  if (!key.startsWith("sk-")) {
    console.error("FAIL: Add OPENAI_API_KEY to .env.local first");
    process.exit(1);
  }

  const { hasAiProvidersConfigured } = await import("../src/lib/heuristic-parse");
  const { generateLeadReasoningBatch } = await import("../src/lib/services/ai/leadReasoning");

  console.log("AI providers detected:", hasAiProvidersConfigured() ? "yes" : "no");

  const results = await generateLeadReasoningBatch(
    [
      {
        name: "Jane Doe",
        title: "CEO",
        company: "CloudCo",
        industry: "SaaS",
        employees: 120,
        location: "San Francisco, California, United States",
        hasEmail: true,
        leadScore: 9,
        profileSummary: "Career: CEO at CloudCo (current); VP Product at DataInc",
      },
    ],
    {
      searchIntent: "SaaS founders in the US",
      originalPrompt: "Find SaaS founders in the US with 20-300 employees",
      leadContext: {
        id: "test",
        userId: "test",
        companyName: "Acme AI",
        websiteUrl: "https://acme.ai",
        businessDescription: "AI automation for B2B sales teams",
        targetMarket: "Mid-market SaaS",
        mainOffer: "Lead scoring automation",
        targetIndustries: ["SaaS"],
        targetCountries: ["United States"],
        companySizeMin: 20,
        companySizeMax: 500,
        targetTitles: ["CEO", "CTO"],
        targetSeniorities: [],
        excludedIndustries: [],
        excludedTitles: [],
        preferredBuyingSignals: [],
        highQualityLeadNotes: "Actively hiring",
        badLeadNotes: null,
        preferredOutreachAngle: "Mention helping them prioritize inbound pipeline",
        servicesToSell: ["AI lead scoring", "sales automation"],
        minLeadScore: 8,
        onboardingCompleted: true,
        createdAt: "",
        updatedAt: "",
      },
    }
  );

  const out = results[0];
  if (!out?.reasoning || !out?.emailDraft) {
    console.error("FAIL: missing reasoning or emailDraft");
    process.exit(1);
  }

  console.log("\n=== WHY REACH OUT ===\n");
  console.log(out.reasoning);
  console.log("\n=== CUSTOMIZED EMAIL DRAFT ===\n");
  console.log(out.emailDraft);

  const looksLikeTemplate =
    out.emailDraft.includes("[Your name]") &&
    out.emailDraft.includes("quick idea for CloudCo") &&
    out.reasoning.includes("Likely relevant for AI lead scoring");

  const hasSubject = /^Subject:/im.test(out.emailDraft);
  const mentionsLead = /Jane|CloudCo|CEO/i.test(out.emailDraft);
  const mentionsOffer = /lead scoring|pipeline|automation|Acme/i.test(
    `${out.reasoning}\n${out.emailDraft}`
  );

  console.log("\n=== CHECKS ===");
  console.log("has Subject line:", hasSubject ? "pass" : "fail");
  console.log("mentions lead name/company:", mentionsLead ? "pass" : "fail");
  console.log("mentions your offer/ICP:", mentionsOffer ? "pass" : "fail");
  console.log(
    "source:",
    looksLikeTemplate ? "TEMPLATE FALLBACK (AI did not customize)" : "AI CUSTOMIZED (ChatGPT)"
  );

  if (!hasSubject || !mentionsLead || !mentionsOffer || looksLikeTemplate) {
    console.error("\nFAIL: outreach not fully AI-customized");
    process.exit(1);
  }

  console.log("\nPASS: local ChatGPT why + email draft working");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
