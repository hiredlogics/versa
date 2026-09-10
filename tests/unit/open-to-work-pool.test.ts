import { afterEach, describe, expect, it, vi } from "vitest";
import { searchAndVerifyOpenToWorkCandidates } from "@/lib/services/apify/open-to-work";

const originalFetch = global.fetch;
const originalApolloKey = process.env.APOLLO_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApolloKey === undefined) delete process.env.APOLLO_API_KEY;
  else process.env.APOLLO_API_KEY = originalApolloKey;
});

describe("Open-to-Work Apollo pool scanning", () => {
  it("merges role/location keyword searches without calling enrichment", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("q_keywords") === "open to work") {
        return new Response(JSON.stringify({ people: [
          { id: "otw", first_name: "Ada", title: "DevOps Engineer #OpenToWork", linkedin_url: "https://www.linkedin.com/in/ada" },
          { id: "possible", first_name: "Bea", title: "DevOps Engineer", linkedin_url: "https://www.linkedin.com/in/bea" },
        ] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ people: [] }),
        { status: 200 }
      );
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await searchAndVerifyOpenToWorkCandidates({
      role: "DevOps Engineer",
      location: "United States",
      count: 16,
    });

    expect(result.scanned).toBe(2);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      name: "Ada",
      isOpenToWork: true,
      otwSignal: "titleHeadline",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("bulk_match"))).toBe(false);
  });

  it("enriches only the explicitly approved final batch with email and phone disabled", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("people/bulk_match")) {
        return new Response(
          JSON.stringify({ matches: [{ id: "otw", linkedin_url: "https://www.linkedin.com/in/ada" }] }),
          { status: 200 }
        );
      }
      const query = new URL(url);
      if (query.searchParams.get("q_keywords") === "open to work") {
        return new Response(
          JSON.stringify({ people: [{ id: "otw", first_name: "Ada", title: "React Developer" }] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ people: [] }), { status: 200 });
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await searchAndVerifyOpenToWorkCandidates({
      role: "React Developer",
      location: "United States",
      count: 16,
      enrichLinkedInUrls: true,
      enrichLimit: 25,
    });

    expect(result.enrichedForLinkedInUrl).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/ada",
      linkedinEnrichment: "found",
    });
    const enrichmentCall = fetchMock.mock.calls.find(([url]) => String(url).includes("people/bulk_match"));
    expect(String(enrichmentCall?.[0])).toContain("reveal_personal_emails=false");
    expect(String(enrichmentCall?.[0])).toContain("reveal_phone_number=false");
  });
});
