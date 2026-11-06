import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeTodoApi } from "../../test/fakeTodoApi";
import { installMatchMedia } from "../../test/matchMedia";
import { renderApp } from "../../test/renderApp";
import { todosModule } from ".";
import { makeTodo } from "./testData";
import { todoUi } from "./uiStore";

beforeEach(() => {
  // A wide touch screen: desktop layout, but deletes are confirmed.
  installMatchMedia((query) => query.includes("min-width") || query.includes("coarse"));
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  // Thursday 8 October 2026, 12:00 in Amsterdam.
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  todoUi.reset();
});

/** Swipes the row holding `title` sideways by `dx` px, quickly. */
async function swipe(title: string, dx: number) {
  const row = (await screen.findByText(title)).closest("[data-todo-id]");
  if (row === null) throw new Error(`no row for ${title}`);
  const at = (x: number) => ({ touches: [{ clientX: x, clientY: 200 }] });
  fireEvent.touchStart(row, at(200));
  for (const step of [0.25, 0.5, 0.75, 1]) fireEvent.touchMove(row, at(200 + dx * step));
  fireEvent.touchEnd(row, { touches: [], changedTouches: [{ clientX: 200 + dx, clientY: 200 }] });
}

const patches = (api: ReturnType<typeof createFakeTodoApi>) =>
  api.state.requests.filter((r) => r.method === "PATCH").map((r) => r.body);

describe("swiping a todo", () => {
  it("to the right adds it to Day Plan, and the toast's Undo takes it out again", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi({ todos: [makeTodo({ title: "Water plants" })] });
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });

    await swipe("Water plants", 160);

    await waitFor(() => {
      expect(api.state.todos[0]?.plan_date).toBe("2026-10-08");
    });
    expect(await screen.findByText("Added “Water plants” to Day Plan")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(api.state.todos[0]?.plan_date).toBeNull();
    });
    expect(patches(api)).toEqual([]);
  });

  it("does not open the details with the tap that ends a swipe", async () => {
    const api = createFakeTodoApi({ todos: [makeTodo({ title: "Water plants" })] });
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });

    await swipe("Water plants", 160);
    fireEvent.click(screen.getByText("Water plants"));
    expect(todoUi.get().selectedId).toBeNull();

    // The next tap opens them as usual.
    fireEvent.click(screen.getByText("Water plants"));
    expect(todoUi.get().selectedId).not.toBeNull();
  });

  it("cannot go right in Day Plan, where the todo already is", async () => {
    const api = createFakeTodoApi({
      todos: [makeTodo({ title: "Call Ann", plan_date: "2026-10-08", plan_position: "a0" })],
    });
    renderApp({ path: "/todos/plan", fetch: api.fetch, modules: [todosModule] });

    await swipe("Call Ann", 160);

    expect(api.state.requests.filter((r) => r.path === "/api/todos/day-plan")).toEqual([]);
    expect(api.state.todos[0]?.plan_date).toBe("2026-10-08");
  });

  it("to the left in Day Plan still asks to delete it", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi({
      todos: [makeTodo({ title: "Call Ann", plan_date: "2026-10-08", plan_position: "a0" })],
    });
    renderApp({ path: "/todos/plan", fetch: api.fetch, modules: [todosModule] });

    await swipe("Call Ann", -160);

    const question = await screen.findByRole("dialog", { name: "Delete todo?" });
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delete todo?" })).not.toBeInTheDocument();
    });
  });

  it("does nothing when let go before the swipe went far enough", async () => {
    const api = createFakeTodoApi({ todos: [makeTodo({ title: "Water plants" })] });
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });

    await swipe("Water plants", 40);
    await swipe("Water plants", -40);

    expect(patches(api)).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "Delete todo?" })).not.toBeInTheDocument();
  });

  it("to the left asks to delete it", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi({ todos: [makeTodo({ title: "Water plants" })] });
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });

    await swipe("Water plants", -160);
    const question = await screen.findByRole("dialog", { name: "Delete todo?" });
    await user.click(within(question).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(api.state.requests.some((r) => r.method === "DELETE")).toBe(true);
    });
  });
});
