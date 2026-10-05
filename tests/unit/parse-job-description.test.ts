import { describe, expect, it, vi } from "vitest";
import {
  parseJobDescription,
  buildSearchPromptFromJobDescription,
} from "@/lib/services/ai/parseJobDescription";
import { findLeadsInputSchema } from "@/lib/validations/search-criteria";

vi.mock("@/lib/services/ai/aiRouter", () => ({
  aiChat: vi.fn(),
}));

import { aiChat } from "@/lib/services/ai/aiRouter";

describe("parseJobDescription", () => {
  it("parses valid AI JSON and caps skills at 8 each", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({
        title: "Senior Full Stack Engineer",
        alternativeTitles: [
          "Full Stack Developer",
          "Software Engineer",
          "Senior Software Engineer",
        ],
        seniority: "Senior",
        location: "San Francisco, CA",
        remote: true,
        minYearsExperience: 5,
        mustHaveSkills: [
          "TypeScript",
          "React",
          "Node.js",
          "PostgreSQL",
          "GraphQL",
          "TailwindCSS",
          "Next.js",
          "Docker",
          "Kubernetes", // 9th skill
          "AWS", // 10th skill
        ],
        niceToHaveSkills: [
          "Redis",
          "Kafka",
          "Terraform",
          "CI/CD",
          "Jest",
          "Vitest",
          "Python",
          "Go",
          "Rust", // 9th skill
        ],
      }),
      provider: "OPENAI",
    });

    const result = await parseJobDescription("We are looking for a Senior Full Stack Engineer...");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Senior Full Stack Engineer");
    expect(result?.seniority).toBe("Senior");
    expect(result?.location).toBe("San Francisco, CA");
    expect(result?.remote).toBe(true);
    expect(result?.minYearsExperience).toBe(5);
    expect(result?.mustHaveSkills).toHaveLength(8);
    expect(result?.mustHaveSkills).toEqual([
      "TypeScript",
      "React",
      "Node.js",
      "PostgreSQL",
      "GraphQL",
      "TailwindCSS",
      "Next.js",
      "Docker",
    ]);
    expect(result?.niceToHaveSkills).toHaveLength(8);
    expect(result?.niceToHaveSkills).toEqual([
      "Redis",
      "Kafka",
      "Terraform",
      "CI/CD",
      "Jest",
      "Vitest",
      "Python",
      "Go",
    ]);
  });

  it("falls back to null on invalid/malformed JSON from AI", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: "This is not JSON at all: <html>Error</html>",
      provider: "OPENAI",
    });

    const result = await parseJobDescription("Job description text");
    expect(result).toBeNull();
  });

  it("falls back to null when AI response is missing required title", async () => {
    vi.mocked(aiChat).mockResolvedValueOnce({
      content: JSON.stringify({
        // Missing title
        seniority: "Lead",
        mustHaveSkills: ["Java"],
      }),
      provider: "OPENAI",
    });

    const result = await parseJobDescription("Job description text");
    expect(result).toBeNull();
  });

  it("falls back to null when aiChat throws", async () => {
    vi.mocked(aiChat).mockRejectedValueOnce(new Error("AI provider rate limited"));

    const result = await parseJobDescription("Job description text");
    expect(result).toBeNull();
  });

  it("returns null immediately for empty or whitespace-only input without calling AI", async () => {
    vi.mocked(aiChat).mockClear();
    const result1 = await parseJobDescription("");
    const result2 = await parseJobDescription("   \n\t  ");
    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(aiChat).not.toHaveBeenCalled();
  });
});

describe("buildSearchPromptFromJobDescription", () => {
  it("builds a concise search prompt with title, alternative titles, location, and remote", () => {
    const prompt = buildSearchPromptFromJobDescription({
      title: "Backend Engineer",
      alternativeTitles: ["Software Engineer - Backend", "Node.js Developer"],
      seniority: "Senior",
      location: "Austin, TX",
      remote: true,
      minYearsExperience: 4,
      mustHaveSkills: ["Node.js", "PostgreSQL"],
      niceToHaveSkills: ["AWS"],
    });

    expect(prompt).toContain("Senior Backend Engineer");
    expect(prompt).toContain("(Software Engineer - Backend, Node.js Developer)");
    expect(prompt).toContain("in Austin, TX");
    expect(prompt).toContain("remote");
  });
});

describe("findLeadsInputSchema job_description validation", () => {
  it("accepts valid input with inputType job_description", () => {
    const parsed = findLeadsInputSchema.safeParse({
      inputType: "job_description",
      jobDescription: "Looking for a Staff Engineer with 8+ years experience in distributed systems.",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts prompt as job description when inputType is job_description", () => {
    const parsed = findLeadsInputSchema.safeParse({
      inputType: "job_description",
      prompt: "Looking for a Staff Engineer with 8+ years experience in distributed systems.",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects job descriptions over 20,000 characters with clear error message", () => {
    const overlyLongText = "A".repeat(20_001);

    const parsedWithJobDesc = findLeadsInputSchema.safeParse({
      inputType: "job_description",
      jobDescription: overlyLongText,
    });
    expect(parsedWithJobDesc.success).toBe(false);
    if (!parsedWithJobDesc.success) {
      const msgs = parsedWithJobDesc.error.issues.map((i) => i.message);
      expect(msgs).toContain("Job description must be 20,000 characters or fewer");
    }

    const parsedWithPrompt = findLeadsInputSchema.safeParse({
      inputType: "job_description",
      prompt: overlyLongText,
    });
    expect(parsedWithPrompt.success).toBe(false);
    if (!parsedWithPrompt.success) {
      const msgs = parsedWithPrompt.error.issues.map((i) => i.message);
      expect(msgs).toContain("Job description must be 20,000 characters or fewer");
    }
  });

  it("accepts job descriptions at the exact 20,000 character limit", () => {
    const exactLimitText = "A".repeat(20_000);

    const parsed = findLeadsInputSchema.safeParse({
      inputType: "job_description",
      jobDescription: exactLimitText,
    });

    expect(parsed.success).toBe(true);
  });
});
