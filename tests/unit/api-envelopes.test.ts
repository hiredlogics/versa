import { describe, expect, it } from "vitest";
import {
  batchStartedEnvelope,
  clarificationEnvelope,
  runningEnvelope,
  searchStateEnvelope,
} from "@/lib/pipeline/api";

/**
 * The envelope is what a browser actually receives, and it is the layer where
 * someone later adds a debug field. Asserting the exact key set means that has
 * to be a deliberate act with a failing test attached.
 */
describe("route envelopes", () => {
  it("clarification returns exactly these keys", () => {
    const body = clarificationEnvelope({
      searchId: "s1",
      understood: { titles: ["HR Manager"] },
      questions: [{ id: "location" }],
      exhausted: false,
    });

    expect(Object.keys(body).sort()).toEqual([
      "exhausted",
      "questions",
      "searchId",
      "status",
      "understood",
    ]);
    expect(body.status).toBe("needs_clarification");
  });

  it("running returns exactly these keys", () => {
    const body = runningEnvelope({ searchId: "s1", brief: {}, credits: {} });
    expect(Object.keys(body).sort()).toEqual(["brief", "credits", "searchId", "status"]);
    expect(body.status).toBe("running");
  });

  it("search state returns exactly these keys", () => {
    const body = searchStateEnvelope({
      search: {},
      understood: null,
      questions: null,
      leads: [],
      credits: {},
    });
    expect(Object.keys(body).sort()).toEqual([
      "credits",
      "leads",
      "questions",
      "search",
      "understood",
    ]);
  });

  it("batch started returns exactly these keys", () => {
    const body = batchStartedEnvelope({ searchId: "s1", credits: {} });
    expect(Object.keys(body).sort()).toEqual(["credits", "searchId", "status"]);
  });

  it("never carries the vendor name or a raw payload through", () => {
    const serialised = JSON.stringify([
      clarificationEnvelope({ searchId: "s1", understood: {}, questions: [] }),
      runningEnvelope({ searchId: "s1", brief: {}, credits: {} }),
      searchStateEnvelope({ search: {}, understood: null, questions: null, leads: [], credits: {} }),
      batchStartedEnvelope({ searchId: "s1", credits: {} }),
    ]).toLowerCase();

    expect(serialised).not.toContain("apollo");
    expect(serialised).not.toContain("raw");
  });

  it("coerces a missing exhausted flag rather than emitting undefined", () => {
    // An absent key and `exhausted: false` are different things to a client.
    const body = clarificationEnvelope({ searchId: "s1", understood: {}, questions: [] });
    expect(body.exhausted).toBe(false);
  });
});
