import { describe, expect, it, vi } from "vitest";

import { UndoStack } from "./undoStack";

describe("UndoStack", () => {
  it("pops newest first and respects its limit", () => {
    const stack = new UndoStack(2);
    const a = { label: "a", undo: vi.fn() };
    const b = { label: "b", undo: vi.fn() };
    const c = { label: "c", undo: vi.fn() };
    stack.push(a);
    stack.push(b);
    stack.push(c);

    expect(stack.size).toBe(2);
    expect(stack.pop()).toBe(c);
    expect(stack.pop()).toBe(b);
    expect(stack.pop()).toBeUndefined();
  });

  it("removes an entry undone from its toast", () => {
    const stack = new UndoStack();
    const a = { label: "a", undo: vi.fn() };
    const b = { label: "b", undo: vi.fn() };
    stack.push(a);
    stack.push(b);

    stack.remove(b);

    expect(stack.pop()).toBe(a);
  });
});
