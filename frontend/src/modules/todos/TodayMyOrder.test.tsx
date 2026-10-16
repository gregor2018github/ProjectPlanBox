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
    makeTodo({ title: "Late", due_date: "2026-10-06" }),
    makeTodo({ title: "Now", due_date: "2026-10-08", position: "a0" }),
    makeTodo({ title: "Also now", due_date: "2026-10-08", position: "a1" }),
    makeTodo({ title: "Tomorrow", due_date: "2026-10-09" }),
  ];
  const api = createFakeTodoApi({ todos });
  renderApp({ path: "/todos/today", fetch: api.fetch, modules: [todosModule] });
  return api;
}

describe("Today: My order", () => {
  it("ranks overdue and due today together, separately from All todos", async () => {
    const user = userEvent.setup();
    const api = setup();

    await user.click(await screen.findByRole("button", { name: "My order" }));
    await waitFor(() => {
      expect(titles("Unsorted todos")).toEqual(["Late", "Now", "Also now"]);
    });
    expect(window.localStorage.getItem("planbox.todos.todayMode")).toBe("ranked");
    expect(screen.getByText("3 unsorted", { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add all to my order" }));
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Late", "Now", "Also now"]);
    });
    expect(screen.getByText("Todos arriving in Today land here.", { exact: false })).toBeVisible();

    // The overdue todo can go below one due today.
    await user.click(screen.getByRole("button", { name: "Actions for “Late”" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move to bottom" }));
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Now", "Also now", "Late"]);
    });
    const row = (title: string) => api.state.todos.find((t) => t.title === title);
    await waitFor(() => {
      expect(row("Late")!.today_rank_position! > row("Also now")!.today_rank_position!).toBe(true);
    });
    expect(row("Late")?.rank_position).toBeNull();

    // "By date" keeps its own groups.
    await user.click(screen.getByRole("button", { name: "By date" }));
    expect(await screen.findByRole("heading", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Unsorted todos" })).not.toBeInTheDocument();
  });

  it("remembers the mode per browser", async () => {
    window.localStorage.setItem("planbox.todos.todayMode", "ranked");
    setup();

    expect(await screen.findByRole("list", { name: "Unsorted todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My order" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
