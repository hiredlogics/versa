import { describe, expect, it } from "vitest";
import { resolveSupportedCountry } from "@/lib/location-policy";
import type { SearchCriteria } from "@/lib/types";

function criteria(country: string, locations: string[]): SearchCriteria {
  return {
    industry: "Any",
    country,
    companySizeMin: 1,
    companySizeMax: 500,
    jobTitles: ["Data Engineer"],
    summary: "test",
    apollo: { personTitles: ["Data Engineer"], personLocations: locations },
  };
}

describe("resolveSupportedCountry", () => {
  it("interprets a bare US state as United States", () => {
    expect(resolveSupportedCountry(criteria("Georgia", ["Georgia"])) .country).toBe("United States");
  });

  it("keeps a direct city filter while inferring its country", () => {
    const result = resolveSupportedCountry(criteria("Atlanta", ["Atlanta"]));
    expect(result.country).toBe("United States");
    expect(result.apollo?.personLocations).toEqual(["Atlanta"]);
  });

  it("recognizes Canadian provinces and cities", () => {
    expect(resolveSupportedCountry(criteria("Ontario", ["Ontario"])) .country).toBe("Canada");
    expect(resolveSupportedCountry(criteria("Toronto", ["Toronto"])) .country).toBe("Canada");
  });

  it("accepts whole-country searches", () => {
    expect(resolveSupportedCountry(criteria("US", ["United States"])) .country).toBe("United States");
    expect(resolveSupportedCountry(criteria("Canada", ["Canada"])) .country).toBe("Canada");
  });

  it("allows countries outside the United States and Canada", () => {
    expect(resolveSupportedCountry(criteria("United Kingdom", ["London"])).country).toBe("United Kingdom");
  });
});
