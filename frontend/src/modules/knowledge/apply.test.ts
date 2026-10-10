import { describe, expect, it } from "vitest";

import {
  appendCollection,
  applyEntryPatch,
  buildEntry,
  mergeEntries,
  moveCollection,
} from "./apply";
import { makeCollection, makeEntry } from "./testData";

const NOW = "2026-10-10T12:00:00.000Z";

describe("buildEntry", () => {
  it("keeps only the kind's own fields, like the server", () => {
    const vars = { id: "n1", kind: "note" as const, title: "  An   idea ", url: "https://x.y" };
    expect(buildEntry(vars, NOW)).toMatchObject({ title: "An idea", url: null, language: null });

    const snippet = buildEntry({ id: "s1", kind: "snippet", title: "x", language: "  " }, NOW);
    expect(snippet.language).toBeNull();
  });
});

describe("applyEntryPatch", () => {
  it("changes present fields, clears language with null and moves the entry to the top", () => {
    const a = makeEntry({ kind: "snippet", language: "py", body: "code" });
    const b = makeEntry();

    const result = applyEntryPatch([b, a], a.id, { title: "Loop", language: null }, NOW);

    expect(result.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(result[0]).toMatchObject({
      title: "Loop",
      language: null,
      body: "code",
      updated_at: NOW,
    });
  });

  it("moves between collections", () => {
    const a = makeEntry({ collection_id: "c1" });
    expect(applyEntryPatch([a], a.id, { collection_id: null }, NOW)[0]?.collection_id).toBeNull();
  });
});

describe("mergeEntries", () => {
  it("replaces rows and keeps the most recently changed first", () => {
    const old = makeEntry({ updated_at: "2026-10-01T00:00:00.000Z" });
    const newer = makeEntry({ updated_at: "2026-10-05T00:00:00.000Z" });
    const server = { ...old, title: "From server", updated_at: NOW };

    expect(mergeEntries([newer, old], [server]).map((e) => e.title)).toEqual([
      "From server",
      newer.title,
    ]);
  });
});

describe("collections", () => {
  it("appends at the end and moves between neighbours", () => {
    const a = makeCollection({ position: "a0" });
    const b = makeCollection({ position: "a1" });
    const withC = appendCollection([b, a], { id: "c", name: " C " }, NOW);
    expect(withC.map((c) => c.id)).toEqual([a.id, b.id, "c"]);

    const moved = moveCollection(withC, "c", a.id, null);
    expect(moved.map((c) => c.id)).toEqual(["c", a.id, b.id]);
  });
});
