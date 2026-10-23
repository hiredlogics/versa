import { describe, expect, it } from "vitest";
import { parseVerdicts } from "@/lib/services/ai/screenCandidates";

describe("parseVerdicts", () => {
  it("maps scores to pass/fail against the threshold", () => {
    const out = parseVerdicts(
      JSON.stringify({
        verdicts: [
          { id: "a", score: 85, reason: "VP Sales at a software firm" },
          { id: "b", score: 20, reason: "car dealership" },
          { id: "c", score: "60", reason: "neutral company name" },
        ],
      }),
      ["a", "b", "c"],
      60
    );
    expect(out.get("a")).toMatchObject({ score: 85, pass: true });
    expect(out.get("b")).toMatchObject({ score: 20, pass: false });
    expect(out.get("c")).toMatchObject({ score: 60, pass: true });
  });

  it("gives ids the model skipped a neutral passing score", () => {
    const out = parseVerdicts(JSON.stringify({ verdicts: [{ id: "a", score: 90 }] }), ["a", "b"], 60);
    expect(out.get("b")).toEqual({ score: 50, pass: false, reason: "not rated" });
    const lenient = parseVerdicts("{}", ["x"], 40);
    expect(lenient.get("x")?.pass).toBe(true);
  });

  it("accepts a bare array and clamps out-of-range scores", () => {
    const out = parseVerdicts(JSON.stringify([{ id: "a", score: 140 }, { id: "b", score: -5 }]), ["a", "b"], 60);
    expect(out.get("a")?.score).toBe(100);
    expect(out.get("b")?.score).toBe(0);
  });

  it("survives malformed JSON by rating nothing", () => {
    const out = parseVerdicts("not json", ["a"], 60);
    expect(out.get("a")?.reason).toBe("not rated");
  });
});
