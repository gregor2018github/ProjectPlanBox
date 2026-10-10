import { describe, expect, it } from "vitest";

import { makeTodo } from "./testData";
import { todoCalendarEntries } from "./useTodoCalendarFeed";
import type { TodoLookup } from "./useTodoData";

const lookup: TodoLookup = {
  listName: (id) => (id === null ? "Inbox" : "Work"),
  sectionName: () => null,
  tagName: () => "",
  todoTitle: (id) => (id === "parent" ? "Launch" : null),
};

describe("todoCalendarEntries", () => {
  it("publishes dated todos with their priority mark and context", () => {
    const todos = [
      makeTodo({ id: "a", title: "Pay rent", due_date: "2026-10-09", priority: 3 }),
      makeTodo({ id: "b", title: "Undated" }),
      makeTodo({
        id: "c",
        title: "Slides",
        due_date: "2026-10-10",
        parent_id: "parent",
        list_id: "l1",
        completed_at: "2026-10-08T09:00:00.000Z",
      }),
    ];
    expect(todoCalendarEntries({ todos, lookup })).toEqual([
      {
        ref: "todos.todo:a",
        title: "Pay rent",
        date: "2026-10-09",
        done: false,
        tone: "danger",
        context: "Inbox",
      },
      {
        ref: "todos.todo:c",
        title: "Slides",
        date: "2026-10-10",
        done: true,
        tone: "default",
        context: "Launch",
      },
    ]);
  });
});
