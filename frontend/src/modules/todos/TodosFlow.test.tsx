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
  // Thursday 8 October 2026, 12:00 in Amsterdam.
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  todoUi.reset();
});

function open(path: string, api = createFakeTodoApi()) {
  renderApp({ path, fetch: api.fetch, modules: [todosModule] });
  return api;
}

const rowTitles = (label: string) =>
  within(screen.getByRole("list", { name: label }))
    .queryAllByRole("checkbox")
    .map((box) => box.getAttribute("aria-label")?.replace(/^(Complete|Reopen) “|”$/g, ""));

describe("todos", () => {
  it("adds todos inline with quick-add syntax, optimistically", async () => {
    const user = userEvent.setup();
    const api = open("/todos/inbox");

    await user.click(await screen.findByRole("button", { name: "Add todo" }));
    await user.type(
      screen.getByRole("textbox", { name: "New todo" }),
      "Buy milk tomorrow !1{Enter}",
    );

    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Buy milk"]);
    });
    const post = api.state.requests.find(
      (r) => r.method === "POST" && r.path === "/api/todos/items",
    );
    expect(post?.body).toMatchObject({ title: "Buy milk", due_date: "2026-10-09", priority: 3 });
    expect((post?.body as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rolls back and explains when the server refuses", async () => {
    const user = userEvent.setup();
    const api = open("/todos/inbox");
    api.state.failing.add("POST /api/todos/items");

    await user.click(await screen.findByRole("button", { name: "Add todo" }));
    await user.type(screen.getByRole("textbox", { name: "New todo" }), "Doomed{Enter}");

    // Error toasts are high priority, so Base UI also adds a hidden screen-reader copy.
    expect((await screen.findAllByText("Could not add the todo")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual([]);
    });
  });

  it("completes with the checkbox and Ctrl+Z reopens", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa01", title: "Water plants" });
    open("/todos/inbox", createFakeTodoApi({ todos: [todo] }));

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Water plants”" }));

    await waitFor(() => {
      expect(rowTitles("Completed today")).toEqual(["Water plants"]);
    });
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Water plants"]);
    });
  });

  it("repeats a todo: completing adds the next one, Ctrl+Z takes it back", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({
      id: "01a11c71-6563-773d-8602-c5617ab6aa05",
      title: "Water plants",
      due_date: "2026-10-08",
    });
    const api = open("/todos/inbox", createFakeTodoApi({ todos: [todo] }));

    await user.click(await screen.findByText("Water plants"));
    await user.click(await screen.findByRole("button", { name: "Repeat" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeat" }), "WEEKLY");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await screen.findByRole("button", { name: "Every week on Thu" });
    const patch = api.state.requests.find((r) => r.method === "PATCH");
    expect(patch?.body).toEqual({ rrule: "FREQ=WEEKLY" });
    expect(screen.getByLabelText("Repeats")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Complete “Water plants”" }));
    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Water plants"]);
      expect(rowTitles("Completed today")).toEqual(["Water plants"]);
    });
    expect((await screen.findAllByText("Repeats. Next one: Tomorrow")).length).toBeGreaterThan(0);

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Completed today" })).toBeNull();
      expect(rowTitles("Inbox")).toEqual(["Water plants"]);
    });
  });

  it("opens details with one click on the row, but not from its checkbox", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa04", title: "Call mum" });
    open("/todos/inbox", createFakeTodoApi({ todos: [todo] }));

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Call mum”" }));
    expect(screen.queryByRole("complementary", { name: "Details" })).toBeNull();

    await user.click(
      within(await screen.findByRole("list", { name: "Completed today" })).getByText("Call mum"),
    );
    expect(await screen.findByRole("complementary", { name: "Details" })).toBeInTheDocument();

    // Clicking empty space in the view closes it again.
    await user.click(screen.getByRole("heading", { name: "Inbox", level: 1 }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Details" })).toBeNull();
    });
  });

  it("selects with the keyboard, deletes, and undoes from the toast", async () => {
    const user = userEvent.setup();
    const todos = [
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa02", title: "First", position: "a0" }),
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa03", title: "Second", position: "a1" }),
    ];
    open("/todos/inbox", createFakeTodoApi({ todos }));
    await screen.findByRole("checkbox", { name: "Complete “Second”" });

    await user.keyboard("{ArrowDown}{ArrowDown}{Delete}");

    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["First"]);
    });
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["First", "Second"]);
    });
  });

  it("shows overdue and today's todos in Today, with sidebar counts", async () => {
    const todos = [
      makeTodo({ title: "Late", due_date: "2026-10-06" }),
      makeTodo({ title: "Now", due_date: "2026-10-08", priority: 3 }),
      makeTodo({ title: "Later", due_date: "2026-10-12" }),
    ];
    open("/todos/today", createFakeTodoApi({ todos }));

    await waitFor(() => {
      expect(rowTitles("Overdue")).toEqual(["Late"]);
    });
    expect(rowTitles("Due today")).toEqual(["Now"]);
    const todayLink = screen.getByRole("link", { name: /Today/ });
    expect(todayLink).toHaveTextContent("2");
  });

  it("quick-adds into a list named with #", async () => {
    const user = userEvent.setup();
    const project = {
      id: "01a11c71-6563-773d-8602-c5617ab6aa10",
      name: "Garden",
      area_id: null,
      position: "a0",
      created_at: "",
      updated_at: "",
    };
    const api = open("/todos/inbox", createFakeTodoApi({ lists: [project] }));
    await screen.findByRole("link", { name: "Garden" });

    await user.keyboard("q");
    await user.type(
      await screen.findByRole("textbox", { name: "New todo" }),
      "Plant tulips #Garden",
    );
    expect(screen.getByText("Adds to Garden")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const post = api.state.requests.find(
        (r) => r.method === "POST" && r.path === "/api/todos/items",
      );
      expect(post?.body).toMatchObject({ title: "Plant tulips", list_id: project.id });
    });
  });

  it("opens details with Enter and saves a new title", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa04", title: "Draft" });
    const api = open("/todos/inbox", createFakeTodoApi({ todos: [todo] }));
    await screen.findByRole("checkbox", { name: "Complete “Draft”" });

    await user.keyboard("{ArrowDown}{Enter}");
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Final{Enter}");

    await waitFor(() => {
      const patch = api.state.requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ title: "Final" });
    });
    expect(await screen.findByRole("checkbox", { name: "Complete “Final”" })).toBeInTheDocument();
  });
});
