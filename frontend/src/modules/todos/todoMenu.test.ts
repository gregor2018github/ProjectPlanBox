import { describe, expect, it, vi } from "vitest";

import type { MenuAction, MenuEntry } from "../../ui/menuTypes";
import { makeTodo } from "./testData";
import { todoMenuEntries } from "./todoMenu";
import type { TodoActions } from "./useTodoActions";

function entry(entries: MenuEntry[], id: string): MenuAction {
  const found = entries.find((e) => e.id === id);
  if (found === undefined || found.kind === "separator") throw new Error(`no action ${id}`);
  return found;
}

function fakeActions(blocker: string | null): TodoActions {
  return {
    quickDates: () => null,
    indentBlocker: vi.fn(() => blocker),
    indent: vi.fn(() => blocker === null),
  } as unknown as TodoActions;
}

describe("todoMenuEntries", () => {
  it("disables Make subtask when there is nothing to nest the todo under", () => {
    const entries = todoMenuEntries(makeTodo(), fakeActions("no todo above"));
    expect(entry(entries, "indent").disabled).toBe(true);
  });

  it("enables Make subtask when an open todo is above", () => {
    const indentAction = vi.fn(() => true);
    const actions = { ...fakeActions(null), indent: indentAction } as TodoActions;
    const indent = entry(todoMenuEntries(makeTodo(), actions), "indent");
    expect(indent.disabled).toBe(false);
    indent.onSelect();
    expect(indentAction).toHaveBeenCalled();
  });
});
