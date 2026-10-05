import { describe, expect, it, vi } from "vitest";
import {
  formatSkillsBreakdown,
  scoreLeadsWithAi,
} from "@/lib/services/ai/scoreLead";
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

  it("defaults matchedSkills and missingSkills to empty arrays when omitted by AI", async () => {
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
    expect(result.scores[0].missingSkills).toEqual(["Spark", "AWS", "Airflow"]);
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
