import { describe, it, expect } from "vitest";
import { isBillingEnforced } from "@/lib/billing/constants";

describe("post-auth redirect", () => {
  it("skips pricing gate in dev when billing is not enforced", () => {
    expect(isBillingEnforced()).toBe(false);
  });
});
