import { describe, expect, it } from "vitest";
import {
  mergePoolPerson,
  normalizeLinkedInUrl,
  poolInputFromCsvRow,
  poolLocationTerms,
  promptAsksForEmail,
  poolInputFromApolloPerson,
  type PoolPersonInput,
} from "@/lib/lead-pool";
import { toStoredApolloProfile } from "@/lib/lead-profile";

const base: PoolPersonInput = {
  apolloPersonId: "a1",
  name: "Jane Doe",
  title: "Senior Data Engineers",
  source: "apollo_search",
};

describe("normalizeLinkedInUrl", () => {
  it("collapses host, protocol, case, query and trailing slash", () => {
    expect(normalizeLinkedInUrl("http://www.linkedin.com/in/Jane-Doe/?trk=abc")).toBe(
      "https://linkedin.com/in/jane-doe"
    );
    expect(normalizeLinkedInUrl("https://pk.linkedin.com/in/jane-doe")).toBe(
      "https://linkedin.com/in/jane-doe"
    );
  });

  it("rejects non-profile URLs", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedInUrl("")).toBeNull();
  });
});

describe("mergePoolPerson", () => {
  it("normalizes the title for matching", () => {
    expect(mergePoolPerson(null, base).titleNormalized).toBe("senior data engineer");
  });

  it("never replaces a verified email with a guessed one", () => {
    const verified = mergePoolPerson(null, { ...base, email: "jane@acme.com", emailStatus: "verified" });
    const merged = mergePoolPerson(verified, { ...base, email: "j.doe@acme.com", emailStatus: "extrapolated" });
    expect(merged.email).toBe("jane@acme.com");
    expect(merged.emailStatus).toBe("verified");
  });

  it("upgrades a guessed email to a verified one", () => {
    const guessed = mergePoolPerson(null, { ...base, email: "j.doe@acme.com" });
    const merged = mergePoolPerson(guessed, { ...base, email: "jane@acme.com", emailStatus: "verified" });
    expect(merged.email).toBe("jane@acme.com");
  });

  it("ignores placeholder emails and keeps earlier fields", () => {
    const first = mergePoolPerson(null, { ...base, company: "Acme", city: "Atlanta", country: "United States" });
    const merged = mergePoolPerson(first, { ...base, company: "Unknown", email: "email_not_unlocked@domain.com" });
    expect(merged.company).toBe("Acme");
    expect(merged.email).toBeNull();
    expect(merged.locationText).toBe("atlanta, united states");
  });

  it("records the email check time and every source", () => {
    const now = new Date("2026-09-29T00:00:00Z");
    const first = mergePoolPerson(null, base);
    const merged = mergePoolPerson(first, { ...base, source: "apollo_enrich", emailChecked: true }, now);
    expect(merged.emailCheckedAt).toEqual(now);
    expect(merged.sources).toEqual(["apollo_enrich", "apollo_search"]);
  });

  it("saves a profile when provided", () => {
    const profile = { headline: "Data Engineer", employment_history: [] };
    const merged = mergePoolPerson(null, { ...base, profile });
    expect(merged.profile).toEqual(profile);
  });

  it("never overwrites an existing profile with null", () => {
    const profile = { headline: "Data Engineer", employment_history: [] };
    const first = mergePoolPerson(null, { ...base, profile });
    // Second merge has no profile — existing should survive.
    const merged = mergePoolPerson(first, { ...base, profile: null });
    expect(merged.profile).toEqual(profile);
  });

  it("newer non-null profile replaces an older one", () => {
    const oldProfile = { headline: "Old" };
    const newProfile = { headline: "New", employment_history: [{ title: "SWE", current: true }] };
    const first = mergePoolPerson(null, { ...base, profile: oldProfile });
    const merged = mergePoolPerson(first, { ...base, profile: newProfile });
    expect(merged.profile).toEqual(newProfile);
  });

  it("keeps saved job history when a newer profile has none", () => {
    const enriched = {
      headline: "Old",
      employment_history: [{ title: "SWE", current: true }],
      github_url: null,
    };
    const fromSearch = { headline: "New", employment_history: [], github_url: "https://github.com/x" };
    const first = mergePoolPerson(null, { ...base, profile: enriched });
    const merged = mergePoolPerson(first, { ...base, profile: fromSearch });
    expect(merged.profile).toEqual({
      headline: "New",
      employment_history: [{ title: "SWE", current: true }],
      github_url: "https://github.com/x",
    });
  });
});

describe("toStoredApolloProfile — github_url", () => {
  it("preserves github_url in the stored profile", () => {
    const raw = {
      headline: "Engineer",
      github_url: "https://github.com/janedoe",
      employment_history: [],
    };
    const stored = toStoredApolloProfile(raw) as Record<string, unknown>;
    expect(stored.github_url).toBe("https://github.com/janedoe");
  });

  it("stores null when github_url is absent", () => {
    const raw = { headline: "Engineer" };
    const stored = toStoredApolloProfile(raw) as Record<string, unknown>;
    expect(stored.github_url).toBeNull();
  });
});

describe("poolInputFromApolloPerson — profile", () => {
  it("builds a profile snapshot from an Apollo person object", () => {
    const person = {
      id: "p1",
      first_name: "Jane",
      last_name: "Doe",
      title: "Data Engineer",
      headline: "Building data things",
      email: null,
      linkedin_url: "https://linkedin.com/in/janedoe",
      github_url: "https://github.com/janedoe",
      employment_history: [{ title: "SWE", organization_name: "Acme", current: true }],
    } as unknown as import("@/lib/types").ApolloPerson;

    const input = poolInputFromApolloPerson(person, "apollo_search");
    expect(input.profile).toBeTruthy();
    const p = input.profile as Record<string, unknown>;
    expect(p.headline).toBe("Building data things");
    expect(p.github_url).toBe("https://github.com/janedoe");
    expect(Array.isArray(p.employment_history)).toBe(true);
  });
});

describe("poolInputFromCsvRow", () => {
  it("reads Serper pipeline rows", () => {
    const input = poolInputFromCsvRow({
      profile_url: "https://linkedin.com/in/jasonhertzog",
      name: "Jason Hertzog",
      headline: "Backend Engineer",
      snippet: "Open to work · Backend engineer with 20+ years",
      field: "backend_engineer",
      region: "united_states",
    });
    expect(input).toMatchObject({
      linkedinUrl: "https://linkedin.com/in/jasonhertzog",
      title: "Backend Engineer",
      country: "United States",
      openToWorkSignal: "open to work",
      source: "serper",
    });
  });

  it("reads Open-to-Work finder rows with location and email", () => {
    const input = poolInputFromCsvRow({
      "Candidate Name": "Colin Bisson",
      "Job Title": "Account Executive",
      "Current Company": "NAVEX",
      Location: "Portland, Oregon, United States",
      "Email Address": "colin.bisson@navex.com",
      "LinkedIn Profile URL": "http://www.linkedin.com/in/colin-bisson",
      "Open To Work": "YES",
      "Detection Method": "Title/Headline Signal",
    });
    expect(input).toMatchObject({ country: "United States", email: "colin.bisson@navex.com", source: "otw_finder" });
  });

  it("skips rows it cannot de-duplicate", () => {
    expect(
      poolInputFromCsvRow({ first_name: "A", last_name: "B", job_title: "Dev", open_to_work_signal: "x", linkedin_url: "" })
    ).toBeNull();
    expect(poolInputFromCsvRow({ unrelated: "column" })).toBeNull();
  });
});

describe("search helpers", () => {
  it("detects prompts that ask for emails", () => {
    expect(promptAsksForEmail("20 data engineers in Atlanta with emails")).toBe(true);
    expect(promptAsksForEmail("video editors in Austin, include contact info")).toBe(true);
    expect(promptAsksForEmail("20 data engineers in Atlanta")).toBe(false);
  });

  it("drops the country from location terms", () => {
    expect(poolLocationTerms(["Atlanta", "United States"], "United States")).toEqual(["atlanta"]);
    expect(poolLocationTerms(["USA"], "United States")).toEqual([]);
  });
});
