import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeTodoApi } from "../../test/fakeTodoApi";
import { renderApp, useDesktopViewport } from "../../test/renderApp";
import { todosModule } from ".";
import { makeTodo } from "./testData";
import { todoUi } from "./uiStore";

beforeEach(() => {
  useDesktopViewport();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  todoUi.reset();
  window.localStorage.clear();
});

const titles = (label: string) =>
  within(screen.getByRole("list", { name: label }))
    .queryAllByRole("checkbox")
    .map((box) => box.getAttribute("aria-label")?.replace(/^(Complete|Reopen) “|”$/g, ""));

function setup() {
  const todos = [
    makeTodo({ title: "Planned", plan_date: "2026-10-08", plan_position: "a0" }),
    makeTodo({ title: "Yesterday's", plan_date: "2026-10-07", plan_position: "a0" }),
    makeTodo({ title: "Late", due_date: "2026-10-06" }),
    makeTodo({ title: "Now", due_date: "2026-10-08" }),
    makeTodo({ title: "Tomorrow", due_date: "2026-10-09" }),
  ];
  const api = createFakeTodoApi({ todos });
  renderApp({ path: "/todos/plan", fetch: api.fetch, modules: [todosModule] });
  return api;
}

describe("DayPlan", () => {
  it("shows today's plan, with Today's other todos as proposals below", async () => {
    setup();

    await waitFor(() => {
      expect(titles("DayPlan")).toEqual(["Planned"]);
    });
    expect(titles("Proposed todos")).toEqual(["Late", "Now"]);
    expect(screen.queryByText("Yesterday's")).not.toBeInTheDocument();
    expect(screen.queryByText("Tomorrow")).not.toBeInTheDocument();
  });

  it("adds a proposal with ＋ and takes it out from its menu", async () => {
    const user = userEvent.setup();
    const api = setup();

    const late = await screen.findByText("Late");
    const row = late.closest("[data-todo-id]");
    if (!(row instanceof HTMLElement)) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Add to DayPlan" }));
    await waitFor(() => {
      expect(titles("DayPlan")).toEqual(["Planned", "Late"]);
    });
    await waitFor(() => {
      expect(titles("Proposed todos")).toEqual(["Now"]);
    });
    await waitFor(() => {
      expect(api.state.todos.find((t) => t.title === "Late")?.plan_date).toBe("2026-10-08");
    });

    await user.click(screen.getByRole("button", { name: "Actions for “Late”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Remove from DayPlan/ }));
    await waitFor(() => {
      expect(titles("DayPlan")).toEqual(["Planned"]);
    });
    await waitFor(() => {
      expect(titles("Proposed todos")).toEqual(["Late", "Now"]);
    });
  });

  it("puts a todo typed here straight into the plan", async () => {
    const user = userEvent.setup();
    const api = setup();

    await user.click(await screen.findByRole("button", { name: "Add todo" }));
    await user.keyboard("Buy bread{Enter}");

    await waitFor(() => {
      expect(titles("DayPlan")).toEqual(["Planned", "Buy bread"]);
    });
    const added = api.state.todos.find((t) => t.title === "Buy bread");
    expect(added?.plan_date).toBe("2026-10-08");
    expect(added?.due_date).toBeNull();
  });
});
