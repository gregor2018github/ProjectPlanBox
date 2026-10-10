import { describe, expect, it } from "vitest";

import { entryCounts, filterEntries, hostOf, isWebUrl, normalizeUrl } from "./selectors";
import { makeEntry } from "./testData";

describe("filterEntries", () => {
  const soup = makeEntry({ title: "Tomato soup", collection_id: "recipes", tag_ids: ["t1"] });
  const docs = makeEntry({ kind: "link", title: "Docs", url: "https://docs.python.org" });
  const loop = makeEntry({
    kind: "snippet",
    title: "Loop",
    body: "for x in items:",
    language: "python",
  });
  const all = [soup, docs, loop];
  const tagName = (id: string) => (id === "t1" ? "dinner" : "?");

  it("scopes to all, unsorted or one collection", () => {
    expect(filterEntries(all, { scope: { kind: "all" }, kind: null, query: "" })).toHaveLength(3);
    expect(filterEntries(all, { scope: { kind: "unsorted" }, kind: null, query: "" })).toEqual([
      docs,
      loop,
    ]);
    expect(
      filterEntries(all, { scope: { kind: "collection", id: "recipes" }, kind: null, query: "" }),
    ).toEqual([soup]);
  });

  it("narrows by kind and by every word of the query, across text, address and tags", () => {
    const scope = { kind: "all" } as const;
    expect(filterEntries(all, { scope, kind: "snippet", query: "" })).toEqual([loop]);
    expect(filterEntries(all, { scope, kind: null, query: "PYTHON" })).toEqual([docs, loop]);
    expect(filterEntries(all, { scope, kind: null, query: "items python" })).toEqual([loop]);
    expect(filterEntries(all, { scope, kind: null, query: "dinner", tagName })).toEqual([soup]);
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

describe("URLs", () => {
  it("shows hosts without www", () => {
    expect(hostOf("https://www.example.com/a?b")).toBe("example.com");
    expect(hostOf("not a url")).toBeNull();
  });

  it("only treats http(s) as openable", () => {
    expect(isWebUrl("https://a.b")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl(null)).toBe(false);
  });

  it("adds https:// to bare addresses but leaves schemes alone", () => {
    expect(normalizeUrl(" example.com/a ")).toBe("https://example.com/a");
    expect(normalizeUrl("http://x.y")).toBe("http://x.y");
    expect(normalizeUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});
