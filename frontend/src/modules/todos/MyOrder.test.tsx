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
  const parent = makeTodo({ title: "Report", position: "a0" });
  const todos = [
    parent,
    makeTodo({ title: "Draft", parent_id: parent.id, position: "a0" }),
    makeTodo({ title: "Call", position: "a1" }),
    makeTodo({ title: "Book", position: "a2" }),
  ];
  const api = createFakeTodoApi({ todos });
  renderApp({ path: "/todos/all", fetch: api.fetch, modules: [todosModule] });
  return api;
}

describe("All todos: My order", () => {
  it("starts with everything unsorted, pulls todos in and keeps the order on the server", async () => {
    const user = userEvent.setup();
    const api = setup();

    await user.click(await screen.findByRole("button", { name: "My order" }));
    await waitFor(() => {
      expect(titles("Unsorted todos")).toEqual(["Report", "Draft", "Call", "Book"]);
    });
    expect(window.localStorage.getItem("planbox.todos.allMode")).toBe("ranked");

    // A subtask names its parent, since it can be ranked on its own.
    const draft = within(screen.getByRole("list", { name: "Unsorted todos" }))
      .getByRole("checkbox", { name: "Complete “Draft”" })
      .closest("li");
    expect(within(draft!).getByText("Report")).toBeInTheDocument();

    // ＋ adds one at the end; "Add all" takes the rest in place order.
    await user.click(within(draft!).getByRole("button", { name: "Add to my order" }));
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Draft"]);
    });
    await user.click(screen.getByRole("button", { name: "Add all to my order" }));
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Draft", "Report", "Call", "Book"]);
    });
    expect(screen.getByText("New todos land here.", { exact: false })).toBeInTheDocument();

    // Alt+↓ moves the selected todo down a place.
    await user.keyboard("{ArrowDown}{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Report", "Draft", "Call", "Book"]);
    });
    const key = (title: string) => api.state.todos.find((t) => t.title === title)?.rank_position;
    await waitFor(() => {
      expect(key("Report")! < key("Draft")!).toBe(true);
    });

    // Ctrl+Z goes back to the order before.
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Draft", "Report", "Call", "Book"]);
    });
  });

  it("sends a todo back to unsorted from its menu, and new todos arrive unsorted", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: "My order" }));
    await user.click(await screen.findByRole("button", { name: "Add all to my order" }));
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Report", "Draft", "Call", "Book"]);
    });

    await user.click(screen.getByRole("button", { name: "Actions for “Call”" }));
    await user.click(await screen.findByRole("menuitem", { name: "Back to unsorted" }));

    await waitFor(() => {
      expect(titles("My order")).toEqual(["Report", "Draft", "Book"]);
    });
    expect(titles("Unsorted todos")).toEqual(["Call"]);

    await user.click(screen.getByRole("button", { name: "Actions for “Book”" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move to top" }));
    await waitFor(() => {
      expect(titles("My order")).toEqual(["Book", "Report", "Draft"]);
    });
  });

  it("remembers the mode per browser", async () => {
    window.localStorage.setItem("planbox.todos.allMode", "ranked");
    setup();

    expect(await screen.findByRole("list", { name: "Unsorted todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My order" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
