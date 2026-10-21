import { afterEach, describe, expect, it } from "vitest";

import type { MenuAction, MenuEntry } from "../../ui/menuTypes";
import { todoCreate } from "./createStore";
import { makeTodo } from "./testData";
import { todoMenuEntries } from "./todoMenu";
import type { TodoActions } from "./useTodoActions";

const actions = { quickDates: () => null } as unknown as TodoActions;

function action(entries: MenuEntry[], id: string): MenuAction | undefined {
  const found = entries.find((e) => e.id === id);
  return found?.kind === "separator" ? undefined : found;
}

afterEach(() => {
  todoCreate.close();
});

describe("todoMenuEntries", () => {
  it("Create subtask opens quick add for a subtask of that todo", () => {
    const todo = makeTodo();
    action(todoMenuEntries(todo, actions), "subtask")?.onSelect();
    expect(todoCreate.get()).toEqual({ kind: "subtask", parentId: todo.id });
  });

  it("offers no Create subtask on a subtask or a completed todo", () => {
    const sub = makeTodo({ parent_id: "p" });
    const done = makeTodo({ completed_at: "2026-10-21T10:00:00.000Z" });
    expect(action(todoMenuEntries(sub, actions), "subtask")).toBeUndefined();
    expect(action(todoMenuEntries(sub, actions), "outdent")).toBeDefined();
    expect(action(todoMenuEntries(done, actions), "subtask")).toBeUndefined();
  });
});
