import { describe, expect, it } from "vitest";
import {
  mergePoolPerson,
  normalizeLinkedInUrl,
  poolInputFromCsvRow,
  poolLocationTerms,
  promptAsksForEmail,
  type PoolPersonInput,
} from "@/lib/lead-pool";

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
