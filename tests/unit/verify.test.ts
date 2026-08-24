import { describe, expect, it } from "vitest";
import { FIT_THRESHOLD, check, finalize, toCandidate, toFilters } from "@/lib/pipeline/verify";
import type { Brief, Candidate } from "@/lib/pipeline/types";

const brief: Brief = {
  intent: "HR managers at mid-size software firms in Toronto",
  titles: ["HR Manager", "Head of People"],
  location: "Toronto",
  industry: "software",
  employeeRanges: ["11,50", "51,200"],
  signals: ["hiring now"],
  excludeTitles: ["intern", "assistant"],
  excludeIndustries: ["staffing"],
  requestedTotal: 100,
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    providerId: "p1",
    name: "Dana Reed",
    title: "HR Manager",
    company: "Acme",
    industry: "software",
    employees: 60,
    location: "Toronto, Ontario, Canada",
    linkedinUrl: null,
    emailLikely: true,
    headline: null,
    ...overrides,
  };
}

describe("toFilters", () => {
  it("sends location, titles and industry only", () => {
    const filters = toFilters(brief);
    expect(filters.personTitles).toEqual(["HR Manager", "Head of People"]);
    expect(filters.personLocations).toEqual(["Toronto"]);
    expect(filters.qKeywords).toBe("software");
    expect(filters.employeeRanges).toEqual(["11,50", "51,200"]);
  });

  it("never leaks signals into the query", () => {
    expect(JSON.stringify(toFilters(brief))).not.toContain("hiring now");
  });

  it("omits empty ranges rather than sending an empty array", () => {
    expect(toFilters({ ...brief, employeeRanges: [] }).employeeRanges).toBeUndefined();
  });

  it("produces an empty location list when the brief has none", () => {
    expect(toFilters({ ...brief, location: null }).personLocations).toEqual([]);
  });

  it("is deterministic — batch 5 queries like batch 1", () => {
    expect(toFilters(brief)).toEqual(toFilters(brief));
  });
});

describe("toCandidate", () => {
  it("survives a missing organization block", () => {
    const result = toCandidate({ id: "x", first_name: "Ada", last_name: "Lovelace", title: "CTO" });
    expect(result.company).toBe("Unknown");
    expect(result.employees).toBeNull();
    expect(result.industry).toBeNull();
  });

  it("uses Unknown for a blank name, never an empty string", () => {
    expect(toCandidate({ id: "x", first_name: "  ", last_name: "" }).name).toBe("Unknown");
  });

  it("infers emailLikely from a present address without the flag", () => {
    expect(toCandidate({ id: "x", email: "a@b.com" }).emailLikely).toBe(true);
  });

  it("prefers the person's location over the employer's", () => {
    const result = toCandidate({
      id: "x",
      city: "Lahore",
      country: "Pakistan",
      organization: { name: "Acme", city: "Dover", state: "Delaware", country: "United States" },
    });
    expect(result.location).toBe("Lahore, Pakistan");
  });
});

describe("check", () => {
  it("keeps a strong match", () => {
    const result = check(candidate(), brief);
    expect(result.keep).toBe(true);
    expect(result.keep && result.fit).toBeGreaterThanOrEqual(FIT_THRESHOLD);
  });

  it("rejects an excluded title before scoring it", () => {
    // "HR Manager Assistant" scores well on title; the exclusion must win.
    const result = check(candidate({ title: "HR Manager Assistant" }), brief);
    expect(result).toEqual({ keep: false, reason: "excluded_title" });
  });

  it("rejects an excluded industry", () => {
    const result = check(candidate({ industry: "staffing" }), brief);
    expect(result).toEqual({ keep: false, reason: "excluded_industry" });
  });

  it("rejects an unrelated title outright", () => {
    expect(check(candidate({ title: "Truck Driver" }), brief)).toEqual({
      keep: false,
      reason: "title_mismatch",
    });
  });

  it("rejects a known headcount outside the buckets", () => {
    expect(check(candidate({ employees: 9000 }), brief)).toEqual({
      keep: false,
      reason: "size_mismatch",
    });
  });

  it("keeps unknown headcount", () => {
    expect(check(candidate({ employees: null }), brief).keep).toBe(true);
  });

  it("keeps a missing location", () => {
    // The provider already filtered by location server-side.
    expect(check(candidate({ location: null }), brief).keep).toBe(true);
  });

  it("rewards signal hits in the headline", () => {
    const withSignal = check(candidate({ headline: "hiring now for Q3" }), brief);
    const without = check(candidate({ headline: null }), brief);
    expect(withSignal.keep && without.keep && withSignal.fit > without.fit).toBe(true);
  });

  it("drops a weak partial match below the threshold", () => {
    const result = check(
      candidate({
        title: "People Operations",
        location: null,
        industry: null,
        emailLikely: false,
      }),
      brief
    );
    expect(result).toEqual({ keep: false, reason: "low_fit" });
  });
});

describe("finalize", () => {
  it("trims before validating so a padded address survives", () => {
    const result = finalize(candidate(), 70, "  dana@acme.com  ");
    expect(result.keep).toBe(true);
    expect(result.keep && result.lead.email).toBe("dana@acme.com");
  });

  it("rejects an unusable address", () => {
    expect(finalize(candidate(), 70, "email_not_unlocked@domain.com", () => false)).toEqual({
      keep: false,
      reason: "no_email",
    });
    expect(finalize(candidate(), 70, null)).toEqual({ keep: false, reason: "no_email" });
    expect(finalize(candidate(), 70, "   ")).toEqual({ keep: false, reason: "no_email" });
  });
});

describe("a realistic page", () => {
  // This is the credit saving, measured: 100 people fetched on free search
  // data, only the survivors are worth paying to unlock.
  it("keeps exactly the 30 good rows out of 100", () => {
    const page: Candidate[] = [
      ...Array.from({ length: 30 }, (_, i) =>
        candidate({ providerId: `good-${i}`, title: "HR Manager", employees: 80 })
      ),
      ...Array.from({ length: 25 }, (_, i) =>
        candidate({ providerId: `role-${i}`, title: "Warehouse Operative" })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        candidate({ providerId: `excl-${i}`, title: "HR Intern" })
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        candidate({ providerId: `size-${i}`, title: "HR Manager", employees: 12000 })
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        candidate({ providerId: `ind-${i}`, title: "HR Manager", industry: "staffing" })
      ),
    ];

    const results = page.map((person) => check(person, brief));
    const survivors = results.filter((r) => r.keep).length;

    const tally = results.reduce<Record<string, number>>((acc, r) => {
      const key = r.keep ? "kept" : r.reason;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    // Printed so the numbers visibly move when FIT_THRESHOLD is tuned.
    console.log(`page of ${page.length} → survivors ${survivors}`, tally);

    expect(survivors).toBe(30);
    expect(tally.title_mismatch).toBe(25);
    expect(tally.excluded_title).toBe(20);
    expect(tally.size_mismatch).toBe(15);
    expect(tally.excluded_industry).toBe(10);
  });
});
