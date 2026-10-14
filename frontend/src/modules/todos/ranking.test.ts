import { describe, expect, it } from "vitest";

import { applyRankOrder } from "./apply";
import { placeInRanking, rankedIds, rankView } from "./selectors";
import { makeTodo } from "./testData";
import type { TodoList } from "./types";

const NOW = "2026-10-08T12:00:00.000Z";
const DONE = "2026-10-08T10:00:00.000Z";

const list = (id: string, position: string): TodoList => ({
  id,
  area_id: null,
  name: id,
  position,
  created_at: NOW,
  updated_at: NOW,
});

describe("rankView", () => {
  it("ranks todos and subtasks flat by key, and keeps the rest unsorted in place order", () => {
    const parent = makeTodo({ title: "Parent", list_id: "B", position: "a0" });
    const sub = makeTodo({ title: "Sub", parent_id: parent.id, list_id: "B", rank_position: "a0" });
    const inbox = makeTodo({ title: "Inbox", rank_position: "a1" });
    const later = makeTodo({ title: "Later", list_id: "A", position: "a0" });
    const newSub = makeTodo({ title: "New sub", parent_id: parent.id, list_id: "B" });
    const done = makeTodo({ title: "Done", rank_position: "a2", completed_at: DONE });

    const view = rankView(
      [parent, sub, inbox, later, newSub, done],
      [],
      [list("A", "a0"), list("B", "a1")],
      [],
    );

    expect(view.ranked.map((t) => t.title)).toEqual(["Sub", "Inbox"]);
    expect(view.unsorted.map((t) => t.title)).toEqual(["Later", "Parent", "New sub"]);
  });

  it("keeps a just-completed todo in its place for a moment", () => {
    const a = makeTodo({ title: "A", rank_position: "a0" });
    const b = makeTodo({ title: "B", rank_position: "a1", completed_at: DONE });
    const c = makeTodo({ title: "C", completed_at: DONE });

    const view = rankView([a, b, c], [], [], [], new Set([b.id, c.id]));

    expect(view.ranked.map((t) => t.title)).toEqual(["A", "B"]);
    expect(view.unsorted.map((t) => t.title)).toEqual(["C"]);
  });
});

describe("rankedIds", () => {
  it("lists open ranked todos by key, ids breaking ties", () => {
    const a = makeTodo({ id: "b", rank_position: "a1" });
    const b = makeTodo({ id: "a", rank_position: "a1" });
    const c = makeTodo({ id: "c", rank_position: "a0" });
    const done = makeTodo({ id: "d", rank_position: "Zz", completed_at: DONE });

    expect(rankedIds([a, b, c, done, makeTodo()])).toEqual(["c", "a", "b"]);
  });
});

describe("placeInRanking", () => {
  const ids = ["a", "b", "c", "d"];

  it("puts a todo before a neighbour, after one, or last", () => {
    expect(placeInRanking(ids, "d", "b", null)).toEqual(["a", "d", "b", "c"]);
    expect(placeInRanking(ids, "a", null, "c")).toEqual(["b", "c", "a", "d"]);
    expect(placeInRanking(ids, "a", null, null)).toEqual(["b", "c", "d", "a"]);
  });

  it("adds a new todo, and keeps hidden ones (a tag filter) where they were", () => {
    // On screen only a, c, d; "x" is dropped between c and d.
    expect(placeInRanking(ids, "x", "d", "c")).toEqual(["a", "b", "c", "x", "d"]);
    // Alt+↑ on c with b hidden: c goes before a, b stays after a.
    expect(placeInRanking(ids, "c", "a", null)).toEqual(["c", "a", "b", "d"]);
  });

  it("falls back to the other neighbour, then to the end", () => {
    expect(placeInRanking(ids, "a", "gone", "c")).toEqual(["b", "c", "a", "d"]);
    expect(placeInRanking(ids, "a", "gone", "gone")).toEqual(["b", "c", "d", "a"]);
  });
});

describe("applyRankOrder", () => {
  it("writes the key sequence in order and clears unranked keys, only where it differs", () => {
    const a = makeTodo({ rank_position: "a0" });
    const b = makeTodo();
    const c = makeTodo({ rank_position: "a5" });
    const other = makeTodo({ rank_position: "a9" });

    const result = applyRankOrder([a, b, c, other], [a.id, b.id], [c.id], NOW);

    expect(result.map((t) => t.rank_position)).toEqual(["a0", "a1", null, "a9"]);
    expect(result[0]).toBe(a);
    expect(result[1]?.updated_at).toBe(NOW);
  });
});
