import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findRecentLayoff,
  normalizeCompanyName,
  scoreOpenToWork,
  type LayoffRecord,
} from "@/lib/open-to-work-score";
import { getGithubRecentEvents, githubUsernameFromUrl } from "@/lib/services/leads/githubActivity";
import { layoffsFromCsv } from "../../scripts/import-layoffs";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    githubActivityCache: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const NOW = new Date("2026-10-05T00:00:00Z");

// Clearly fake companies: test fixture only, never in data/layoffs.json.
const FAKE_LAYOFFS: LayoffRecord[] = [
  { company: "Example Widgets Inc.", date: "2026-08-14", source: "test" },
  { company: "Old Layoff Example LLC", date: "2025-01-10", source: "test" },
];

describe("scoreOpenToWork signals", () => {
  it("open-to-work words in the headline give +5 and 'likely'", () => {
    const result = scoreOpenToWork({ title: "Engineer", headline: "#OpenToWork", now: NOW });
    expect(result).toEqual({ level: "likely", points: 5, reasons: ["Says they are open to work"] });
  });

  it("no current job with the last one ending recently gives +4", () => {
    const result = scoreOpenToWork({
      title: "Engineer",
      employmentHistory: [{ current: false, start_date: "2022-01-01", end_date: "2026-07-01" }],
      now: NOW,
    });
    expect(result.points).toBe(4);
    expect(result.level).toBe("maybe");
    expect(result.reasons).toEqual(["Last job ended July 2026"]);
  });

  it("a job that ended years ago does not count", () => {
    const result = scoreOpenToWork({
      employmentHistory: [{ current: false, end_date: "2019-03-01" }],
      now: NOW,
    });
    expect(result.points).toBe(0);
    expect(result.level).toBe("unlikely");
  });

  it("no current job and no end date says 'No current job listed'", () => {
    const result = scoreOpenToWork({ employmentHistory: [{ current: false }], now: NOW });
    expect(result.reasons).toEqual(["No current job listed"]);
    expect(result.points).toBe(4);
  });

  it("a layoff at their company in the last 6 months gives +3", () => {
    const result = scoreOpenToWork({
      company: "Example Widgets",
      layoffs: FAKE_LAYOFFS,
      now: NOW,
    });
    expect(result.points).toBe(3);
    expect(result.reasons).toEqual(["Example Widgets had layoffs in August 2026"]);
  });

  it("just starting a job gives -3 with no reason text", () => {
    const result = scoreOpenToWork({
      headline: "open to work",
      employmentHistory: [{ current: true, start_date: "2026-08-01" }],
      now: NOW,
    });
    expect(result.points).toBe(2);
    expect(result.level).toBe("maybe");
    expect(result.reasons).toEqual(["Says they are open to work"]);
  });

  it("freelance, contract or consultant titles give +1", () => {
    for (const title of ["Freelance Developer", "Contract Data Engineer", "IT Consultant"]) {
      expect(scoreOpenToWork({ title, now: NOW }).points).toBe(1);
    }
  });

  it("a consultant alone stays 'unlikely' (not 'likely looking')", () => {
    expect(scoreOpenToWork({ title: "Senior Consultant", now: NOW }).level).toBe("unlikely");
  });

  it("recent GitHub activity gives +1 only at 5+ events", () => {
    expect(scoreOpenToWork({ githubRecentEvents: 5, now: NOW }).reasons).toEqual([
      "Active on GitHub recently",
    ]);
    expect(scoreOpenToWork({ githubRecentEvents: 4, now: NOW }).points).toBe(0);
  });
});

describe("scoreOpenToWork thresholds", () => {
  it("uses 5+ likely, 2-4 maybe, under 2 unlikely", () => {
    const layoff = { company: "Example Widgets", layoffs: FAKE_LAYOFFS, now: NOW };
    expect(scoreOpenToWork({ ...layoff, title: "Consultant", githubRecentEvents: 9 }).level).toBe("likely");
    expect(scoreOpenToWork({ ...layoff, title: "Consultant" }).level).toBe("maybe");
    expect(scoreOpenToWork({ title: "Consultant", githubRecentEvents: 9, now: NOW }).level).toBe("maybe");
    expect(scoreOpenToWork({ title: "Engineer", now: NOW }).level).toBe("unlikely");
  });
});

describe("layoff company matching", () => {
  it("ignores case, punctuation and Inc/LLC/Ltd endings", () => {
    expect(normalizeCompanyName("Stripe, Inc.")).toBe("stripe");
    expect(normalizeCompanyName("Acme Ltd")).toBe("acme");
    expect(normalizeCompanyName("ACME LLC")).toBe("acme");
  });

  it("does not match a different company that only shares a word", () => {
    expect(findRecentLayoff("Example", FAKE_LAYOFFS, NOW)).toBeNull();
    expect(findRecentLayoff("Example Widgets Labs", FAKE_LAYOFFS, NOW)).toBeNull();
  });

  it("ignores layoffs older than 6 months", () => {
    expect(findRecentLayoff("Old Layoff Example", FAKE_LAYOFFS, NOW)).toBeNull();
  });
});

describe("layoffsFromCsv", () => {
  it("reads company,date,source rows and skips bad ones", () => {
    const csv = 'company,date,source\n"Example Widgets, Inc.",2026-08-14,news\nNo Date Co,,x\n';
    expect(layoffsFromCsv(csv)).toEqual({
      records: [{ company: "Example Widgets, Inc.", date: "2026-08-14", source: "news" }],
      skipped: 1,
    });
  });

  it("needs company and date columns", () => {
    expect(() => layoffsFromCsv("name,when\nA,2026-01-01")).toThrow(/company/);
  });
});

describe("GitHub activity", () => {
  beforeEach(() => {
    vi.mocked(prisma.githubActivityCache.findMany).mockReset();
    vi.mocked(prisma.githubActivityCache.upsert).mockReset();
    vi.unstubAllGlobals();
  });

  it("reads usernames from profile URLs only", () => {
    expect(githubUsernameFromUrl("https://github.com/Octocat")).toBe("octocat");
    expect(githubUsernameFromUrl("http://www.github.com/octocat/repo")).toBe("octocat");
    expect(githubUsernameFromUrl("https://gitlab.com/octocat")).toBeNull();
    expect(githubUsernameFromUrl(null)).toBeNull();
  });

  it("uses the cache and does not call GitHub on a hit", async () => {
    vi.mocked(prisma.githubActivityCache.findMany).mockResolvedValue([
      { username: "octocat", recentEvents: 7 },
    ] as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getGithubRecentEvents(["octocat"], NOW);
    expect(result.get("octocat")).toBe(7);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts events from the last 30 days on a miss and saves them", async () => {
    vi.mocked(prisma.githubActivityCache.findMany).mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { created_at: "2026-10-01T00:00:00Z" },
          { created_at: "2026-09-20T00:00:00Z" },
          { created_at: "2026-07-01T00:00:00Z" },
        ],
      })
    );

    const result = await getGithubRecentEvents(["octocat"], NOW);
    expect(result.get("octocat")).toBe(2);
    expect(prisma.githubActivityCache.upsert).toHaveBeenCalledOnce();
  });

  it("gives no signal (and saves nothing) when GitHub fails", async () => {
    vi.mocked(prisma.githubActivityCache.findMany).mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const result = await getGithubRecentEvents(["octocat"], NOW);
    expect(result.has("octocat")).toBe(false);
    expect(prisma.githubActivityCache.upsert).not.toHaveBeenCalled();
  });
});
