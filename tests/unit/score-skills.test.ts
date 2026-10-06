import { describe, expect, it, vi } from "vitest";
import { scoreLeadsWithAi, shortList, skillsFromAi } from "@/lib/services/ai/scoreLead";
import { formatSkillsBreakdown } from "@/lib/skills-breakdown";
import type { LeadScoreContext } from "@/lib/types";

vi.mock("@/lib/services/ai/aiRouter", () => ({
  aiChat: vi.fn(),
}));

import { aiChat } from "@/lib/services/ai/aiRouter";

describe("formatSkillsBreakdown", () => {
  it("formats both matched and missing skills correctly", () => {
    const formatted = formatSkillsBreakdown(8, ["Spark", "AWS"], ["Airflow"]);
    expect(formatted).toBe("8/10 · Has Spark, AWS · No sign of Airflow");
  });

  it("formats matched skills only when missing skills are empty", () => {
    const formatted = formatSkillsBreakdown(8, ["Spark", "AWS"], []);
    expect(formatted).toBe("8/10 · Has Spark, AWS");
  });

  it("formats missing skills only when matched skills are empty", () => {
    const formatted = formatSkillsBreakdown(6, [], ["Airflow"]);
    expect(formatted).toBe("6/10 · No sign of Airflow");
  });

  it("returns null when both matched and missing are empty or null", () => {
    expect(formatSkillsBreakdown(7, [], [])).toBeNull();
    expect(formatSkillsBreakdown(7, null, undefined)).toBeNull();
    expect(formatSkillsBreakdown(7, ["", "   "], [])).toBeNull();
  });

  it("never includes the word 'Missing' in user-facing breakdown", () => {
    const formatted = formatSkillsBreakdown(7, [], ["Python"]);
    expect(formatted).not.toContain("Missing");
    expect(formatted).toContain("No sign of Python");
  });
});

describe("scoreLeadsWithAi with skills breakdown", () => {
  const mockContext: LeadScoreContext = {
    searchIntent: "Data Engineer",
    targetSkills: ["Spark", "AWS", "Airflow"],
  };

  const sampleLead = {
    id: "lead-1",
    name: "Alex Smith",
    title: "Senior Data Engineer",
    company: "DataCorp",
    industry: "Software",
    employees: 500,
    location: "New York, NY",
    email: "alex@datacorp.com",
    hasEmail: true,
  };

  it("returns matchedSkills and missingSkills from AI response", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({
        leads: [
          {
            index: 0,
            leadScore: 9,
            priorityLevel: "Very High",
            reasoning: "Strong background with Spark and AWS in distributed systems.",
            matchedSkills: ["Spark", "AWS"],
            missingSkills: ["Airflow"],
          },
        ],
      }),
      provider: "OPENAI",
    });

    const result = await scoreLeadsWithAi([sampleLead], mockContext);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].leadScore).toBe(9);
    expect(result.scores[0].matchedSkills).toEqual(["Spark", "AWS"]);
    expect(result.scores[0].missingSkills).toEqual(["Airflow"]);
    expect(result.provider).toBe("OPENAI");
  });

  it("leaves both lists empty when the AI gives no skills at all", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({
        leads: [
          {
            index: 0,
            leadScore: 8,
            priorityLevel: "High",
            reasoning: "Relevant experience.",
          },
        ],
      }),
      provider: "OPENAI",
    });

    const result = await scoreLeadsWithAi([sampleLead], mockContext);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].matchedSkills).toEqual([]);
    expect(result.scores[0].missingSkills).toEqual([]);
  });

  it("falls back gracefully with empty arrays on malformed JSON or error", async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new Error("AI service unavailable"));

    const result = await scoreLeadsWithAi([sampleLead], mockContext);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].matchedSkills).toEqual([]);
    expect(result.scores[0].missingSkills).toEqual([]);
    expect(result.provider).toBe("HEURISTIC");
  });
});

describe("skillsFromAi", () => {
  const targets = ["Spark", "AWS", "Airflow"];

  it("drops skills the search did not ask for and keeps the search's spelling", () => {
    expect(skillsFromAi({ matchedSkills: ["spark", "Kafka"], missingSkills: [] }, targets)).toEqual({
      matchedSkills: ["Spark"],
      missingSkills: ["AWS", "Airflow"],
    });
  });

  it("returns empty lists when the search has no target skills", () => {
    expect(skillsFromAi({ matchedSkills: ["Spark"] }, [])).toEqual({
      matchedSkills: [],
      missingSkills: [],
    });
  });
});

describe("score pros and cons", () => {
  const context: LeadScoreContext = { searchIntent: "CTO fintech" };
  const lead = {
    name: "Sam Lee",
    title: "Marketing Intern",
    company: "Tiny Co",
    industry: "Retail",
    employees: 3,
    location: "Austin, TX",
    hasEmail: false,
  };

  it("keeps up to 3 short pros and cons from the AI", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({
        leads: [
          {
            index: 0,
            leadScore: 4,
            priorityLevel: "Low",
            reasoning: "Weak fit.",
            pros: ["Based in Austin"],
            cons: ["Intern, not a buyer", "Retail, not fintech", "No email", "Tiny company", ""],
          },
        ],
      }),
      provider: "OPENAI",
    });
    const result = await scoreLeadsWithAi([lead], context);
    expect(result.scores[0].pros).toEqual(["Based in Austin"]);
    expect(result.scores[0].cons).toEqual(["Intern, not a buyer", "Retail, not fintech", "No email"]);
  });

  it("backup rules list what passed and what failed", async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new Error("AI down"));
    const result = await scoreLeadsWithAi([lead], context);
    expect(result.provider).toBe("HEURISTIC");
    expect(result.scores[0].cons).toEqual(
      expect.arrayContaining(["Not a decision-maker title", "No email found"])
    );
  });
});

describe("comparing leads in one search", () => {
  const a = { name: "A", title: "CTO", company: "X", industry: "Fintech", employees: 50, location: "NY", hasEmail: true };
  const b = { ...a, name: "B", title: "Intern" };

  it("tells the AI to compare the leads with each other", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({ leads: [{ index: 0, leadScore: 9 }, { index: 1, leadScore: 3 }] }),
      provider: "OPENAI",
    });
    const result = await scoreLeadsWithAi([a, b], { searchIntent: "CTO", compareAcrossLeads: true });
    const system = vi.mocked(aiChat).mock.calls.at(-1)![0].system;
    expect(system).toContain("Compare them with each other");
    expect(result.scores.map((s) => s.leadScore)).toEqual([9, 3]);
    expect(result.fromAi).toEqual([true, true]);
  });

  it("marks leads the AI skipped, so re-scoring keeps their old score", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({ leads: [{ index: 0, leadScore: 8 }] }),
      provider: "OPENAI",
    });
    const result = await scoreLeadsWithAi([a, b], { searchIntent: "CTO" });
    expect(result.fromAi).toEqual([true, false]);
  });
});

describe("shortList", () => {
  it("drops vague points and hidden lead numbers", () => {
    expect(
      shortList([
        "Senior title; most others are mid-level",
        "Diverse job history across companies",
        "Limited information on recent achievements",
        "Lower than lead 2",
        "No indication of job-seeking status",
        "Works at a 15,000-person telecom",
      ])
    ).toEqual(["Senior title; most others are mid-level", "Works at a 15,000-person telecom"]);
  });
});

