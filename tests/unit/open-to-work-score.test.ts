import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  scoreOpenToWork,
  normalizeCompanyName,
  extractGithubUsername,
  hadRecentLayoff,
  getGithubRecentEvents,
  type LayoffRecord,
} from "@/lib/open-to-work-score";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    githubActivityCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("normalizeCompanyName", () => {
  it("strips common corporate suffixes and punctuation", () => {
    expect(normalizeCompanyName("Stripe, Inc.")).toBe("stripe");
    expect(normalizeCompanyName("Google LLC")).toBe("google");
    expect(normalizeCompanyName("Meta Platforms Technologies")).toBe("meta platforms");
    expect(normalizeCompanyName("Acme Corp.")).toBe("acme");
    expect(normalizeCompanyName("OpenAI, Co.")).toBe("openai");
    expect(normalizeCompanyName("Vercel Labs")).toBe("vercel");
  });

  it("handles null or empty input", () => {
    expect(normalizeCompanyName(null)).toBe("");
    expect(normalizeCompanyName("")).toBe("");
  });
});

describe("extractGithubUsername", () => {
  it("extracts username from various URL shapes and handles", () => {
    expect(extractGithubUsername("https://github.com/octocat")).toBe("octocat");
    expect(extractGithubUsername("http://www.github.com/octocat/")).toBe("octocat");
    expect(extractGithubUsername("@octocat")).toBe("octocat");
    expect(extractGithubUsername("octocat")).toBe("octocat");
    expect(extractGithubUsername("https://github.com/octocat?tab=repositories")).toBe("octocat");
    expect(extractGithubUsername("https://linkedin.com/in/octocat")).toBeNull();
    expect(extractGithubUsername(null)).toBeNull();
  });
});

describe("hadRecentLayoff", () => {
  const referenceDate = new Date("2026-10-01T00:00:00Z");
  const layoffs: LayoffRecord[] = [
    { company: "Acme Corp", date: "2026-05-15" },
    { company: "Old Corp", date: "2024-01-01" }, // > 12 months ago
  ];

  it("matches company with normalized name and recent layoff", () => {
    expect(hadRecentLayoff("Acme Technologies Inc.", layoffs, referenceDate)).toBe(true);
    expect(hadRecentLayoff("Acme", layoffs, referenceDate)).toBe(true);
  });

  it("does not match when layoff was more than 12 months ago", () => {
    expect(hadRecentLayoff("Old Corp LLC", layoffs, referenceDate)).toBe(false);
  });

  it("returns false for non-matching companies", () => {
    expect(hadRecentLayoff("Stripe", layoffs, referenceDate)).toBe(false);
  });
});

describe("getGithubRecentEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses cached database entry if within 7 days", async () => {
    const now = new Date("2026-10-05T00:00:00Z");
    vi.mocked(prisma.githubActivityCache.findUnique).mockResolvedValueOnce({
      id: "cache-1",
      username: "octocat",
      recentEvents: 12,
      checkedAt: new Date("2026-10-03T00:00:00Z"), // 2 days ago
      updatedAt: new Date("2026-10-03T00:00:00Z"),
    });

    const events = await getGithubRecentEvents("octocat", now);
    expect(events).toBe(12);
  });

  it("fetches from GitHub API and caches when cache is stale or missing", async () => {
    const now = new Date("2026-10-05T00:00:00Z");
    vi.mocked(prisma.githubActivityCache.findUnique).mockResolvedValueOnce(null);

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { created_at: "2026-10-02T00:00:00Z" },
        { created_at: "2026-09-25T00:00:00Z" },
        { created_at: "2026-08-01T00:00:00Z" }, // > 30 days ago
      ],
    });
    vi.stubGlobal("fetch", mockFetch);

    const events = await getGithubRecentEvents("octocat", now);
    expect(events).toBe(2);
    expect(prisma.githubActivityCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "octocat" },
        create: expect.objectContaining({ recentEvents: 2 }),
      })
    );

    vi.unstubAllGlobals();
  });

  it("returns 0 gracefully on network error or timeout without throwing", async () => {
    const now = new Date("2026-10-05T00:00:00Z");
    vi.mocked(prisma.githubActivityCache.findUnique).mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Timeout")));

    const events = await getGithubRecentEvents("octocat", now);
    expect(events).toBe(0);

    vi.unstubAllGlobals();
  });
});

describe("scoreOpenToWork", () => {
  const referenceDate = new Date("2026-10-05T00:00:00Z");

  it("awards +3 points and likely level for open to work headline phrases", async () => {
    const result = await scoreOpenToWork({
      title: "Software Engineer",
      headline: "Senior Software Engineer #OpenToWork | Looking for new opportunities",
      now: referenceDate,
      githubRecentEvents: 0,
      layoffsData: [],
    });

    expect(result.points).toBe(3);
    expect(result.level).toBe("likely");
    expect(result.reasons).toContain("Public headline indicates availability");
  });

  it("awards +2 points when most recent position has ended", async () => {
    const result = await scoreOpenToWork({
      title: "Senior Developer",
      employmentHistory: [
        {
          title: "Senior Developer",
          organization_name: "Tech Corp",
          start_date: "2022-01-01",
          end_date: "2026-08-01",
          current: false,
        },
      ],
      now: referenceDate,
      githubRecentEvents: 0,
      layoffsData: [],
    });

    expect(result.points).toBe(2);
    expect(result.level).toBe("maybe");
    expect(result.reasons).toContain("Most recent position ended");
  });

  it("awards +1 point for tenure over 2 years in current role", async () => {
    const result = await scoreOpenToWork({
      title: "Lead Engineer",
      employmentHistory: [
        {
          title: "Lead Engineer",
          organization_name: "Stable Co",
          start_date: "2023-01-01",
          current: true,
        },
      ],
      now: referenceDate,
      githubRecentEvents: 0,
      layoffsData: [],
    });

    expect(result.points).toBe(1);
    expect(result.level).toBe("maybe");
    expect(result.reasons).toContain("In current role for over 2 years");
  });

  it("deducts -1 point for recently started position (< 6 months)", async () => {
    const result = await scoreOpenToWork({
      title: "Junior Engineer",
      employmentHistory: [
        {
          title: "Junior Engineer",
          organization_name: "New Co",
          start_date: "2026-08-01", // ~2 months ago
          current: true,
        },
      ],
      now: referenceDate,
      githubRecentEvents: 0,
      layoffsData: [],
    });

    expect(result.points).toBe(-1);
    expect(result.level).toBe("unlikely");
    expect(result.reasons).toContain("Recently started a new position (< 6 months)");
  });

  it("awards +2 points when employer had recent layoffs", async () => {
    const result = await scoreOpenToWork({
      title: "Backend Engineer",
      company: "Downsizing Corp Inc",
      layoffsData: [{ company: "Downsizing Corp", date: "2026-04-01" }],
      now: referenceDate,
      githubRecentEvents: 0,
    });

    expect(result.points).toBe(2);
    expect(result.level).toBe("maybe");
    expect(result.reasons).toContain("Employer had public layoffs in the past 12 months");
  });

  it("awards +1 point when user has active GitHub contributions", async () => {
    const result = await scoreOpenToWork({
      title: "Full Stack Engineer",
      githubRecentEvents: 8,
      now: referenceDate,
      layoffsData: [],
    });

    expect(result.points).toBe(1);
    expect(result.level).toBe("maybe");
    expect(result.reasons).toContain("Active public GitHub contributions in last 30 days");
  });

  it("combines multiple signals to reach likely level (>= 3 points)", async () => {
    const result = await scoreOpenToWork({
      title: "Staff Engineer",
      company: "Acme Corp",
      layoffsData: [{ company: "Acme", date: "2026-06-01" }], // +2
      employmentHistory: [
        {
          title: "Staff Engineer",
          organization_name: "Acme Corp",
          start_date: "2022-01-01", // > 2 years (+1)
          current: true,
        },
      ],
      githubRecentEvents: 10, // +1
      now: referenceDate,
    });

    // 2 (layoffs) + 1 (tenure) + 1 (github) = 4 points -> likely
    expect(result.points).toBe(4);
    expect(result.level).toBe("likely");
    expect(result.reasons).toHaveLength(3);
  });
});
