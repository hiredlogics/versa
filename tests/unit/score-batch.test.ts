import { describe, it, expect } from "vitest";
import { chunkLeadsForScoring, SCORE_BATCH_SIZE } from "@/lib/services/ai/scoreLead";

describe("scoreLead batching", () => {
  it("exports a sensible default batch size", () => {
    expect(SCORE_BATCH_SIZE).toBeGreaterThanOrEqual(5);
    expect(SCORE_BATCH_SIZE).toBeLessThanOrEqual(40);
  });

  it("chunks leads for scoring without dropping items", () => {
    const leads = Array.from({ length: 45 }, (_, i) => ({ id: i }));
    const chunks = chunkLeadsForScoring(leads, 20);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(20);
    expect(chunks[1]).toHaveLength(20);
    expect(chunks[2]).toHaveLength(5);
    expect(chunks.flat().map((l) => l.id)).toEqual(leads.map((l) => l.id));
  });

  it("returns empty array for empty input", () => {
    expect(chunkLeadsForScoring([], 20)).toEqual([]);
  });
});
