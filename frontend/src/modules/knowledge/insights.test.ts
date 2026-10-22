import { describe, expect, it } from "vitest";

import { addedPerMonth, countsByCollection, countsByTag, wordCount } from "./insights";
import { makeCollection, makeEntry, textBox } from "./testData";

describe("knowledge insights", () => {
  const recipes = makeCollection({ id: "c1", name: "Recipes" });
  const entries = [
    makeEntry({ collection_id: "c1", tag_ids: ["t1"] }),
    makeEntry({ collection_id: "c1", content: { boxes: [textBox("Two words")] } }),
    makeEntry({ tag_ids: ["t1", "t2"], content: { boxes: [textBox("Ünïcode, 3 more\nwords")] } }),
  ];

  it("counts collections, tags and words", () => {
    expect(countsByCollection(entries, [recipes]).map((c) => [c.label, c.count])).toEqual([
      ["Recipes", 2],
      ["Unsorted", 1],
    ]);
    expect(countsByTag(entries).map((c) => [c.key, c.count])).toEqual([
      ["t1", 2],
      ["t2", 1],
    ]);
    expect(wordCount(entries)).toBe(6);
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
