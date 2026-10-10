import { describe, expect, it } from "vitest";

import {
  applyComplete,
  applyDelete,
  applyMove,
  applyPatch,
  applyReopen,
  buildTodo,
  mergeTodos,
  siblingsOf,
} from "./apply";
import { makeTodo } from "./testData";
import { INBOX } from "./types";

const NOW = "2026-10-08T12:00:00.000Z";

describe("buildTodo", () => {
  it("appends to its container and cleans the title", () => {
    const a = makeTodo({ position: "a0" });
    const created = buildTodo([a], { id: "new", title: "  Buy\n milk ", ...INBOX }, NOW);

    expect(created.title).toBe("Buy milk");
    expect(created.position > a.position).toBe(true);
    expect(created.completed_at).toBeNull();
  });

  it("respects neighbours", () => {
    const a = makeTodo({ position: "a0" });
    const b = makeTodo({ position: "a1" });
    const created = buildTodo(
      [a, b],
      { id: "new", title: "Mid", ...INBOX, after_id: a.id, before_id: b.id },
      NOW,
    );

    expect(created.position > a.position && created.position < b.position).toBe(true);
  });
});

describe("completion", () => {
  it("completes open subtasks with the parent and reopens exactly those", () => {
    const parent = makeTodo();
    const earlier = makeTodo({ parent_id: parent.id, completed_at: "2026-10-08T09:00:00.000Z" });
    const open = makeTodo({ parent_id: parent.id });

    const done = applyComplete([parent, earlier, open], parent.id, NOW);
    const reopened = applyReopen(done, parent.id, NOW);

    expect(done.map((t) => t.completed_at)).toEqual([NOW, earlier.completed_at, NOW]);
    expect(reopened.map((t) => t.completed_at)).toEqual([null, earlier.completed_at, null]);
  });

  it("reopening a subtask reopens its parent", () => {
    const parent = makeTodo({ completed_at: NOW });
    const child = makeTodo({ parent_id: parent.id, completed_at: NOW });

    const result = applyReopen([parent, child], child.id, NOW);

    expect(result.every((t) => t.completed_at === null)).toBe(true);
  });
});

describe("applyMove", () => {
  it("re-homes a parent together with its subtasks", () => {
    const parent = makeTodo();
    const child = makeTodo({ parent_id: parent.id });
    const target = { list_id: "L", section_id: "S", parent_id: null };

    const [movedParent, movedChild] = applyMove(
      [parent, child],
      parent.id,
      target,
      null,
      null,
      NOW,
    );

    expect(movedParent).toMatchObject(target);
    expect(movedChild).toMatchObject({ list_id: "L", section_id: "S", parent_id: parent.id });
  });

  it("reorders among siblings", () => {
    const a = makeTodo({ position: "a0" });
    const b = makeTodo({ position: "a1" });
    const c = makeTodo({ position: "a2" });

    const moved = applyMove([a, b, c], c.id, INBOX, b.id, a.id, NOW);

    expect(siblingsOf(moved, INBOX).map((t) => t.id)).toEqual([a.id, c.id, b.id]);
  });
});

describe("patch, delete and merge", () => {
  it("patches one todo", () => {
    const t = makeTodo();
    expect(applyPatch([t], t.id, { priority: 3 }, NOW)[0]).toMatchObject({
      priority: 3,
      updated_at: NOW,
    });
  });

  it("anchors a new repeat on the due date and stops it when the date goes", () => {
    const t = makeTodo({ due_date: "2026-10-12" });
    const repeating = applyPatch([t], t.id, { rrule: "FREQ=WEEKLY" }, NOW);
    expect(repeating[0]).toMatchObject({ rrule: "FREQ=WEEKLY", recurrence_anchor: "2026-10-12" });

    const moved = applyPatch(repeating, t.id, { due_date: "2026-10-13" }, NOW);
    expect(moved[0]).toMatchObject({ rrule: "FREQ=WEEKLY", recurrence_anchor: "2026-10-12" });

    const undated = applyPatch(repeating, t.id, { due_date: null }, NOW);
    expect(undated[0]).toMatchObject({ due_date: null, rrule: null, recurrence_anchor: null });
  });

  it("deletes a todo with its subtasks", () => {
    const parent = makeTodo();
    const child = makeTodo({ parent_id: parent.id });
    const other = makeTodo();
    expect(applyDelete([parent, child, other], parent.id)).toEqual([other]);
  });

  it("merges server rows by id and adds unknown ones", () => {
    const t = makeTodo({ title: "old" });
    const fresh = makeTodo();
    const merged = mergeTodos([t], [{ ...t, title: "new" }, fresh]);
    expect(merged.map((x) => x.title)).toEqual(["new", fresh.title]);
  });
});
