import { describe, expect, it } from "vitest";

import {
  addedPerMonth,
  countsByCollection,
  countsByKind,
  countsByLanguage,
  countsBySite,
  countsByTag,
} from "./insights";
import { makeCollection, makeEntry } from "./testData";

describe("knowledge insights", () => {
  const recipes = makeCollection({ id: "c1", name: "Recipes" });
  const entries = [
    makeEntry({ collection_id: "c1", tag_ids: ["t1"] }),
    makeEntry({ kind: "link", url: "https://www.example.com/a", collection_id: "c1" }),
    makeEntry({ kind: "link", url: "https://example.com/b", tag_ids: ["t1", "t2"] }),
    makeEntry({ kind: "snippet", language: "Python" }),
    makeEntry({ kind: "snippet", language: "python" }),
    makeEntry({ kind: "snippet", language: null }),
  ];

  it("counts kinds, collections and tags", () => {
    expect(countsByKind(entries)).toEqual({ note: 1, link: 2, snippet: 3 });
    expect(countsByCollection(entries, [recipes]).map((c) => [c.label, c.count])).toEqual([
      ["Unsorted", 4],
      ["Recipes", 2],
    ]);
    expect(countsByTag(entries).map((c) => [c.key, c.count])).toEqual([
      ["t1", 2],
      ["t2", 1],
    ]);
  });

  it("groups links by site and snippets by language", () => {
    expect(countsBySite(entries)).toEqual([{ key: "example.com", label: "example.com", count: 2 }]);
    expect(countsByLanguage(entries).map((c) => [c.label, c.count])).toEqual([
      ["Python", 2],
      ["Plain text", 1],
    ]);
  });

  it("counts entries added per local month", () => {
    const months = addedPerMonth(
      [
        makeEntry({ created_at: "2026-09-30T22:30:00.000Z" }), // 1 Oct in Amsterdam
        makeEntry({ created_at: "2026-09-15T10:00:00.000Z" }),
        makeEntry({ created_at: "2025-01-15T10:00:00.000Z" }), // too old
      ],
      "2026-10-08",
      "Europe/Amsterdam",
      3,
    );
    expect(months).toEqual([
      { month: "2026-08-01", count: 0 },
      { month: "2026-09-01", count: 1 },
      { month: "2026-10-01", count: 1 },
    ]);
  });
});
