import { describe, it, expect } from "vitest";
import { scopedLeadSearchWhere, scopedLeadWhere } from "@/lib/services/searches/access";

describe("search access scoping", () => {
  it("scopes list queries to the authenticated user", () => {
    expect(scopedLeadSearchWhere("user_a")).toEqual({
      userId: "user_a",
      deletedAt: null,
    });
  });

  it("scopes detail queries to user and search id", () => {
    expect(scopedLeadSearchWhere("user_a", "search_b")).toEqual({
      userId: "user_a",
      deletedAt: null,
      id: "search_b",
    });
  });

  it("never returns another user's search when ids differ", () => {
    const ownerFilter = scopedLeadSearchWhere("user_a", "search_b");
    expect(ownerFilter.userId).not.toBe("user_b");
    expect(ownerFilter.id).toBe("search_b");
  });

  it("scopes lead queries to the authenticated user", () => {
    expect(scopedLeadWhere("user_a")).toEqual({
      userId: "user_a",
      deletedAt: null,
    });
  });
});
