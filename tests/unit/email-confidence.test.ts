import { describe, it, expect } from "vitest";
import {
  emailConfidence,
  emailConfidenceLabel,
  isVerifiedEmail,
} from "@/lib/email-confidence";

describe("email confidence", () => {
  it("treats provider-verified addresses as verified", () => {
    expect(emailConfidence("a@b.com", "verified")).toBe("verified");
    expect(emailConfidence("a@b.com", "Verified")).toBe("verified");
    expect(isVerifiedEmail("a@b.com", "verified")).toBe(true);
  });

  it("treats pattern guesses as unverified", () => {
    // Apollo returns "extrapolated" for addresses built from a company pattern.
    expect(emailConfidence("a@b.com", "extrapolated")).toBe("guessed");
    expect(emailConfidence("a@b.com", "guessed")).toBe("guessed");
    expect(emailConfidence("a@b.com", "unavailable")).toBe("guessed");
    expect(isVerifiedEmail("a@b.com", "extrapolated")).toBe(false);
  });

  it("does not assume an unlabelled address is verified", () => {
    expect(emailConfidence("a@b.com", null)).toBe("guessed");
    expect(emailConfidence("a@b.com", "")).toBe("guessed");
    expect(isVerifiedEmail("a@b.com", null)).toBe(false);
  });

  it("reports missing when there is no address", () => {
    expect(emailConfidence(null, "verified")).toBe("missing");
    expect(emailConfidence("   ", "verified")).toBe("missing");
    expect(isVerifiedEmail(null, "verified")).toBe(false);
  });

  it("labels each state for the table and exports", () => {
    expect(emailConfidenceLabel("verified")).toBe("Verified");
    expect(emailConfidenceLabel("guessed")).toBe("Likely");
    expect(emailConfidenceLabel("missing")).toBe("Missing");
  });
});
