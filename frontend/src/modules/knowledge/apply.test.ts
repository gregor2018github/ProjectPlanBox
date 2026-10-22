import { describe, expect, it } from "vitest";

import {
  appendCollection,
  applyEntryPatch,
  buildEntry,
  mergeEntries,
  moveCollection,
} from "./apply";
import { makeCollection, makeEntry, textBox } from "./testData";

const NOW = "2026-10-10T12:00:00.000Z";

describe("buildEntry", () => {
  it("cleans the title and derives the text from the content, like the server", () => {
    const content = { boxes: [textBox("one\ntwo")] };
    expect(buildEntry({ id: "n1", title: "  An   idea ", content }, NOW)).toMatchObject({
      title: "An idea",
      body: "one\ntwo",
      content,
    });
    expect(buildEntry({ id: "n2", title: "Empty" }, NOW)).toMatchObject({
      content: { boxes: [] },
      body: "",
    });
  });
});

describe("applyEntryPatch", () => {
  it("changes present fields, re-derives the text and moves the entry to the top", () => {
    const a = makeEntry({ content: { boxes: [textBox("old")] } });
    const b = makeEntry();
    const content = { boxes: [textBox("new", { x: 40 })] };

    const result = applyEntryPatch([b, a], a.id, { title: "Loop", content }, NOW);

    expect(result.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(result[0]).toMatchObject({ title: "Loop", body: "new", content, updated_at: NOW });
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
