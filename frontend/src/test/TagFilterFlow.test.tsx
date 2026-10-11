import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { todosModule } from "../modules/todos";
import { makeTodo } from "../modules/todos/testData";
import { todoUi } from "../modules/todos/uiStore";
import { createFakeTodoApi } from "./fakeTodoApi";
import { renderApp, useDesktopViewport } from "./renderApp";

beforeEach(() => {
  useDesktopViewport();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  todoUi.reset();
});

const NOW = "2026-10-08T08:00:00.000Z";
const WORK = { id: "tag-work", name: "work", created_at: NOW, updated_at: NOW };

const rowTitles = (label: string) =>
  within(screen.getByRole("list", { name: label }))
    .queryAllByRole("checkbox")
    .map((box) => box.getAttribute("aria-label")?.replace(/^(Complete|Reopen) “|”$/g, ""));

describe("tag filter", () => {
  it("hides untagged items, glows, follows navigation and clears", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi({
      tags: [WORK],
      todos: [
        makeTodo({ title: "Report", tag_ids: [WORK.id], due_date: "2026-10-08" }),
        makeTodo({ title: "Groceries", due_date: "2026-10-08" }),
      ],
    });
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });
    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Report", "Groceries"]);
    });
    const pane = screen.getByRole("search", { name: "Tag filter" });
    expect(pane).toHaveAttribute("data-active", "false");

    await user.click(within(pane).getByRole("button", { name: "Filter by tag…" }));
    await user.type(screen.getByRole("combobox", { name: "Filter by tag" }), "wor{Enter}");

    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Report"]);
    });
    expect(pane).toHaveAttribute("data-active", "true");
    expect(within(pane).getByText("#work")).toBeInTheDocument();

    // A todo added while filtering gets the filter tag, so it stays visible.
    await user.click(screen.getByRole("button", { name: "Add todo" }));
    await user.type(screen.getByRole("textbox", { name: "New todo" }), "Slides{Enter}");
    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Report", "Slides"]);
    });
    const post = api.state.requests.find(
      (r) => r.method === "POST" && r.path === "/api/todos/items",
    );
    expect(post?.body).toMatchObject({ title: "Slides", tag_ids: [WORK.id] });

    // The filter follows the user to another view.
    await user.click(screen.getByRole("link", { name: /^Today/ }));
    await waitFor(() => {
      expect(rowTitles("Due today")).toEqual(["Report"]);
    });
    expect(screen.getByRole("search", { name: "Tag filter" })).toHaveAttribute(
      "data-active",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(rowTitles("Due today")).toEqual(["Report", "Groceries"]);
    });
    expect(screen.getByRole("search", { name: "Tag filter" })).toHaveAttribute(
      "data-active",
      "false",
    );
  });
});
