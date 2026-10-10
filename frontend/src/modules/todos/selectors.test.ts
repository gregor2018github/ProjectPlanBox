import { describe, expect, it } from "vitest";

import { counts, inboxView, listTree, listView, todayView, upcomingView } from "./selectors";
import { makeSection, makeTodo } from "./testData";

const TODAY = "2026-10-08";
const DONE = "2026-10-08T10:00:00.000Z";

describe("inboxView", () => {
  it("shows top-level Inbox todos, open and done today separately", () => {
    const open = makeTodo();
    const done = makeTodo({ completed_at: DONE });
    const child = makeTodo({ parent_id: open.id });
    const inList = makeTodo({ list_id: "L" });

    const view = inboxView([open, done, child, inList]);

    expect(view.open).toEqual([open]);
    expect(view.done).toEqual([done]);
  });
});

describe("listView", () => {
  it("groups open todos by section in section order", () => {
    const later = makeSection({ list_id: "L", position: "a2" });
    const now = makeSection({ list_id: "L", position: "a1" });
    const loose = makeTodo({ list_id: "L" });
    const inNow = makeTodo({ list_id: "L", section_id: now.id });
    const inLater = makeTodo({ list_id: "L", section_id: later.id });
    const done = makeTodo({ list_id: "L", completed_at: DONE });

    const view = listView([loose, inNow, inLater, done], [later, now], "L");

    expect(view.groups.map((g) => [g.section?.id ?? null, g.todos.map((t) => t.id)])).toEqual([
      [null, [loose.id]],
      [now.id, [inNow.id]],
      [later.id, [inLater.id]],
    ]);
    expect(view.done).toEqual([done]);
  });
});

describe("todayView", () => {
  it("lists overdue, today (high priority first) and completed", () => {
    const overdue = makeTodo({ due_date: "2026-10-06" });
    const low = makeTodo({ due_date: TODAY, priority: 1 });
    const high = makeTodo({ due_date: TODAY, priority: 3 });
    const subtask = makeTodo({ due_date: TODAY, parent_id: "p" });
    const done = makeTodo({ due_date: TODAY, completed_at: DONE });
    const future = makeTodo({ due_date: "2026-10-09" });

    const view = todayView([overdue, low, high, subtask, done, future], TODAY);

    expect(view.overdue).toEqual([overdue]);
    expect(view.today.map((t) => t.id)).toEqual([high.id, low.id, subtask.id]);
    expect(view.done).toEqual([done]);
  });

  it("puts hand-ordered todos first, in their order, then the rest auto-sorted", () => {
    const first = makeTodo({ due_date: TODAY, today_position: "a0" });
    const second = makeTodo({ due_date: TODAY, priority: 0, today_position: "a1" });
    const high = makeTodo({ due_date: TODAY, priority: 3 });
    const low = makeTodo({ due_date: TODAY, priority: 1 });
    const olderLate = makeTodo({ due_date: "2026-10-01" });
    const lateFirst = makeTodo({ due_date: "2026-10-07", today_position: "a0" });

    const view = todayView([low, second, high, first, olderLate, lateFirst], TODAY);

    expect(view.today.map((t) => t.id)).toEqual([first.id, second.id, high.id, low.id]);
    expect(view.overdue.map((t) => t.id)).toEqual([lateFirst.id, olderLate.id]);
  });
});

describe("upcomingView", () => {
  it("groups future open todos by day", () => {
    const fri = makeTodo({ due_date: "2026-10-09" });
    const mon = makeTodo({ due_date: "2026-10-12" });
    const fri2 = makeTodo({ due_date: "2026-10-09", priority: 2 });

    const days = upcomingView([mon, fri, fri2, makeTodo({ due_date: TODAY })], TODAY);

    expect(days.map((d) => [d.date, d.todos.map((t) => t.id)])).toEqual([
      ["2026-10-09", [fri2.id, fri.id]],
      ["2026-10-12", [mon.id]],
    ]);
  });
});

describe("counts", () => {
  it("counts open Inbox, list and due-today todos", () => {
    const todos = [
      makeTodo(),
      makeTodo({ list_id: "L" }),
      makeTodo({ list_id: "L", due_date: "2026-10-01" }),
      makeTodo({ completed_at: DONE }),
    ];

    expect(counts(todos, TODAY)).toEqual({ inbox: 1, today: 1, overdue: 1, lists: { L: 2 } });
  });
});

describe("listTree", () => {
  it("puts loose lists first, then areas with their lists", () => {
    const area = { id: "A", name: "Work", position: "a0", created_at: "", updated_at: "" };
    const loose = {
      id: "L1",
      area_id: null,
      name: "Loose",
      position: "a0",
      created_at: "",
      updated_at: "",
    };
    const inArea = { ...loose, id: "L2", area_id: "A", name: "Project" };

    const tree = listTree([area], [inArea, loose]);

    expect(tree.loose).toEqual([loose]);
    expect(tree.areas).toEqual([{ area, lists: [inArea] }]);
  });
});
