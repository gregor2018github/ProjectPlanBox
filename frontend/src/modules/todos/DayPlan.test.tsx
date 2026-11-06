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

describe("Day Plan", () => {
  it("shows today's plan, with every other open todo as folded proposals below", async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(titles("Day Plan")).toEqual(["Planned"]);
    });
    const toggle = screen.getByRole("button", { name: /Proposals/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("4");
    expect(screen.queryByText("Late")).not.toBeInTheDocument();

    await user.click(toggle);
    // By due date; yesterday's plan has lapsed, so it is proposed again (no date: last).
    expect(titles("Proposed todos")).toEqual(["Late", "Now", "Tomorrow", "Yesterday's"]);
  });

  it("adds a proposal with ＋ and takes it out from its menu", async () => {
    const user = userEvent.setup();
    const api = setup();

    await user.click(await screen.findByRole("button", { name: /Proposals/ }));
    const late = await screen.findByText("Late");
    const row = late.closest("[data-todo-id]");
    if (!(row instanceof HTMLElement)) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Add to Day Plan" }));
    await waitFor(() => {
      expect(titles("Day Plan")).toEqual(["Planned", "Late"]);
    });
    await waitFor(() => {
      expect(titles("Proposed todos")).toEqual(["Now", "Tomorrow", "Yesterday's"]);
    });
    await waitFor(() => {
      expect(api.state.todos.find((t) => t.title === "Late")?.plan_date).toBe("2026-10-08");
    });

    await user.click(screen.getByRole("button", { name: "Actions for “Late”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Remove from Day Plan/ }));
    await waitFor(() => {
      expect(titles("Day Plan")).toEqual(["Planned"]);
    });
    await waitFor(() => {
      expect(titles("Proposed todos")).toEqual(["Late", "Now", "Tomorrow", "Yesterday's"]);
    });
  });

  it("puts a todo typed here straight into the plan", async () => {
    const user = userEvent.setup();
    const api = setup();

    await user.click(await screen.findByRole("button", { name: "Add todo" }));
    await user.keyboard("Buy bread{Enter}");

    await waitFor(() => {
      expect(titles("Day Plan")).toEqual(["Planned", "Buy bread"]);
    });
    const added = api.state.todos.find((t) => t.title === "Buy bread");
    expect(added?.plan_date).toBe("2026-10-08");
    expect(added?.due_date).toBeNull();
  });

  it("folds the proposals again on every visit", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole("button", { name: /Proposals/ }));
    expect(await screen.findByText("Late")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Inbox/ }));
    await user.click(await screen.findByRole("link", { name: /Day Plan/ }));

    const toggle = await screen.findByRole("button", { name: /Proposals/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Proposed todos" })).not.toBeInTheDocument();
  });

  it("is the page the app opens on, and Home is still one click away", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi({ todos: [] });
    renderApp({ path: "/", fetch: api.fetch, modules: [todosModule], openStartPage: true });

    expect(await screen.findByRole("heading", { name: "Day Plan", level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(await screen.findByRole("region", { name: "Todos" })).toBeInTheDocument();
  });

  it("leaves a deep link alone", async () => {
    const api = createFakeTodoApi({ todos: [] });
    renderApp({
      path: "/todos/inbox",
      fetch: api.fetch,
      modules: [todosModule],
      openStartPage: true,
    });

    expect(await screen.findByRole("heading", { name: "Inbox", level: 1 })).toBeInTheDocument();
  });
});
