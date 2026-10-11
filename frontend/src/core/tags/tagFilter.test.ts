import { describe, expect, it } from "vitest";

import { matchesTagFilter, parseTagFilter, serializeTagFilter } from "./tagFilter";

describe("tag filter", () => {
  it("round-trips the search param and drops empties and duplicates", () => {
    expect(parseTagFilter("a,b,,a")).toEqual(["a", "b"]);
    expect(parseTagFilter(undefined)).toEqual([]);
    expect(parseTagFilter(42)).toEqual([]);
    expect(serializeTagFilter(["a", "b"])).toBe("a,b");
    expect(serializeTagFilter([])).toBeUndefined();
  });

  it("matches only items carrying every filter tag", () => {
    expect(matchesTagFilter(["a", "b"], ["a"])).toBe(true);
    expect(matchesTagFilter(["a"], ["a", "b"])).toBe(false);
    expect(matchesTagFilter([], [])).toBe(true);
  });
});
