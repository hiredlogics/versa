import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichPeopleBatch } from "@/lib/apollo";

describe("enrichPeopleBatch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does not fall back to per-person requests when bulk_match has no match", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ matches: [null] }), { status: 200 })
    );
    globalThis.fetch = fetchMock;

    const result = await enrichPeopleBatch([{
      id: "person-1", first_name: "Ada", last_name: "Lovelace", title: "Engineer",
      email: null, linkedin_url: null, has_email: false,
      organization: { name: "Analytical", industry: "Software", estimated_num_employees: 1, city: "", state: "", country: "" },
    }]);

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/people/bulk_match");
  });
});
