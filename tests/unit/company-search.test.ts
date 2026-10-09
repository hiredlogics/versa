import { describe, expect, it, vi } from "vitest";
import { domainFromInput, titlesFromRoles } from "@/lib/services/leads/companySearch";
import { buildApolloSearchVariants } from "@/lib/search-criteria";
import type { SearchCriteria } from "@/lib/types";

vi.mock("@/lib/services/ai/aiRouter", () => ({ aiChat: vi.fn() }));

describe("domainFromInput", () => {
  it("reads websites in any common form", () => {
    expect(domainFromInput("stripe.com")).toBe("stripe.com");
    expect(domainFromInput("https://www.Stripe.com/about")).toBe("stripe.com");
    expect(domainFromInput("http://app.example.co.uk?x=1")).toBe("app.example.co.uk");
  });

  it("returns null for a plain company name", () => {
    expect(domainFromInput("Hinge Health")).toBeNull();
    expect(domainFromInput("Stripe")).toBeNull();
  });
});

describe("titlesFromRoles", () => {
  it("splits roles on commas, 'and' and slashes", () => {
    expect(titlesFromRoles("CTO, engineering managers and recruiters")).toEqual([
      "CTO",
      "engineering managers",
      "recruiters",
    ]);
    expect(titlesFromRoles("VP/Director")).toEqual(["VP", "Director"]);
  });

  it("means everyone when empty", () => {
    expect(titlesFromRoles("")).toEqual([]);
    expect(titlesFromRoles(undefined)).toEqual([]);
  });
});

describe("company search filters", () => {
  const base: SearchCriteria = {
    industry: "Any",
    country: "",
    companySizeMin: 0,
    companySizeMax: 0,
    jobTitles: [],
    summary: "People at stripe.com",
    companyOnly: true,
    apollo: { personTitles: [], personLocations: [], organizationDomains: ["stripe.com"] },
  };

  it("searches everyone at the company, anywhere, with no default titles", () => {
    const variants = buildApolloSearchVariants(base);
    expect(variants).toHaveLength(1);
    expect(variants[0].filters.organizationDomains).toEqual(["stripe.com"]);
    expect(variants[0].filters.personTitles).toEqual([]);
    expect(variants[0].filters.personLocations).toEqual([]);
  });

  it("tries the roles first, then everyone at the company", () => {
    const variants = buildApolloSearchVariants({
      ...base,
      jobTitles: ["CTO"],
      apollo: { ...base.apollo!, personTitles: ["CTO"] },
    });
    expect(variants.map((v) => v.filters.personTitles)).toEqual([["CTO"], []]);
    expect(variants.every((v) => v.filters.organizationDomains?.[0] === "stripe.com")).toBe(true);
  });
});
