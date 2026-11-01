import { describe, expect, it } from "vitest";

import {
  allView,
  counts,
  dayPlanView,
  filterTodosByTags,
  inboxView,
  listTree,
  listView,
  planIds,
  todayView,
} from "./selectors";
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

describe("dayPlanView", () => {
  it("orders the plan by key and proposes the rest of Today, overdue first", () => {
    const b = makeTodo({ plan_date: TODAY, plan_position: "a2" });
    const a = makeTodo({ plan_date: TODAY, plan_position: "a1", due_date: TODAY });
    const done = makeTodo({ plan_date: TODAY, plan_position: "a0", completed_at: DONE });
    const due = makeTodo({ due_date: TODAY });
    const late = makeTodo({ due_date: "2026-10-01" });
    const later = makeTodo({ due_date: "2026-10-20" });

    const view = dayPlanView([b, a, done, due, late, later], TODAY);

    expect(view.planned.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(view.done.map((t) => t.id)).toEqual([done.id]);
    expect(view.proposals.map((t) => t.id)).toEqual([late.id, due.id]);
  });

  it("empties itself on a new day", () => {
    const yesterday = makeTodo({ plan_date: "2026-10-07", plan_position: "a0", due_date: TODAY });

    const view = dayPlanView([yesterday], TODAY);

    expect(view.planned).toEqual([]);
    expect(view.proposals.map((t) => t.id)).toEqual([yesterday.id]);
    expect(planIds([yesterday], TODAY)).toEqual([]);
  });

  it("keeps a just-completed todo in place", () => {
    const done = makeTodo({ plan_date: TODAY, plan_position: "a0", completed_at: DONE });

    const view = dayPlanView([done], TODAY, new Set([done.id]));

    expect(view.planned.map((t) => t.id)).toEqual([done.id]);
    expect(view.done).toEqual([]);
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

    expect(counts(todos, TODAY)).toEqual({
      open: 3,
      inbox: 1,
      today: 1,
      overdue: 1,
      plan: 0,
      lists: { L: 2 },
    });
  });
});

describe("listTree", () => {
  it("puts loose lists first, then areas with their lists", () => {
    const area = {
      id: "A",
      name: "Work",
      hue: 264,
      position: "a0",
      created_at: "",
      updated_at: "",
    };
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

describe("filterTodosByTags", () => {
  it("keeps matches with their subtasks and the parents of matching subtasks", () => {
    const tagged = makeTodo({ tag_ids: ["work"] });
    const childOfTagged = makeTodo({ parent_id: tagged.id });
    const parent = makeTodo();
    const taggedChild = makeTodo({ parent_id: parent.id, tag_ids: ["work"] });
    const sibling = makeTodo({ parent_id: parent.id });
    const other = makeTodo({ tag_ids: ["home"] });
    const all = [tagged, childOfTagged, parent, taggedChild, sibling, other];

    expect(filterTodosByTags(all, ["work"])).toEqual([tagged, childOfTagged, parent, taggedChild]);
    expect(filterTodosByTags(all, ["work", "home"])).toEqual([]);
    expect(filterTodosByTags(all, [])).toEqual(all);
  });
});

describe("allView", () => {
  it("groups every open todo by place in sidebar order, with totals", () => {
    const area = {
      id: "A",
      name: "Work",
      hue: 264,
      position: "a0",
      created_at: "",
      updated_at: "",
    };
    const loose = {
      id: "L1",
      area_id: null,
      name: "Loose",
      position: "a0",
      created_at: "",
      updated_at: "",
    };
    const inArea = { ...loose, id: "L2", area_id: "A", name: "Project" };
    const empty = { ...loose, id: "L3", name: "Empty", position: "a1" };
    const section = makeSection({ list_id: "L2", position: "a0" });
    const inSection = makeTodo({ list_id: "L2", section_id: section.id, position: "a0" });
    const noSection = makeTodo({ list_id: "L2", position: "a9" });
    const inbox = makeTodo();
    const sub = makeTodo({ parent_id: inbox.id });
    const looseTodo = makeTodo({ list_id: "L1" });
    const orphan = makeTodo({ list_id: "gone" });
    const done = makeTodo({ list_id: "L1", completed_at: DONE });

    const view = allView(
      [inSection, noSection, inbox, sub, looseTodo, orphan, done],
      [area],
      [inArea, empty, loose],
      [section],
    );

    expect(view.groups.map((g) => [g.key, g.area?.id ?? null, g.todos.map((t) => t.id)])).toEqual([
      ["inbox", null, [inbox.id]],
      ["L1", null, [looseTodo.id]],
      ["L2", "A", [noSection.id, inSection.id]],
      ["elsewhere", null, [orphan.id]],
    ]);
    expect(view.done.map((t) => t.id)).toEqual([done.id]);
    expect([view.open, view.subtasksOpen]).toEqual([5, 1]);
  });
});
