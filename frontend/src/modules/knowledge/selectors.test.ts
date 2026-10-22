import { describe, expect, it } from "vitest";

import { entryCounts, filterEntries } from "./selectors";
import { makeEntry, textBox } from "./testData";

describe("filterEntries", () => {
  const soup = makeEntry({ title: "Tomato soup", collection_id: "recipes", tag_ids: ["t1"] });
  const docs = makeEntry({
    title: "Docs",
    content: { boxes: [textBox("https://docs.python.org")] },
  });
  const loop = makeEntry({
    title: "Loop",
    content: { boxes: [textBox("for x in items: python")] },
  });
  const all = [soup, docs, loop];
  const tagName = (id: string) => (id === "t1" ? "dinner" : "?");

  it("scopes to all, unsorted or one collection", () => {
    expect(filterEntries(all, { scope: { kind: "all" }, query: "" })).toHaveLength(3);
    expect(filterEntries(all, { scope: { kind: "unsorted" }, query: "" })).toEqual([docs, loop]);
    expect(filterEntries(all, { scope: { kind: "collection", id: "recipes" }, query: "" })).toEqual(
      [soup],
    );
  });

  it("narrows by every word of the query, across title, text and tags", () => {
    const scope = { kind: "all" } as const;
    expect(filterEntries(all, { scope, query: "PYTHON" })).toEqual([docs, loop]);
    expect(filterEntries(all, { scope, query: "items python" })).toEqual([loop]);
    expect(filterEntries(all, { scope, query: "dinner", tagName })).toEqual([soup]);
  });
});

describe("entryCounts", () => {
  it("counts per collection and unsorted", () => {
    const counts = entryCounts([
      makeEntry({ collection_id: "a" }),
      makeEntry({ collection_id: "a" }),
      makeEntry(),
    ]);
    expect(counts).toEqual({ total: 3, unsorted: 1, byCollection: { a: 2 } });
  });
});
