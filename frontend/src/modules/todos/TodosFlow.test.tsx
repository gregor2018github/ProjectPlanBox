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

/** Opens the "Completed today" group, which starts collapsed. */
async function showCompleted(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /^Completed today/ }));
}

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
    await showCompleted(user);

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
    await showCompleted(user);
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

  it("repeats counted from completion: only plain intervals, saved with repeat_from", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({
      id: "01a11c71-6563-773d-8602-c5617ab6aa06",
      title: "Haircut",
      due_date: "2026-10-08",
    });
    const api = open("/todos/inbox", createFakeTodoApi({ todos: [todo] }));

    await user.click(await screen.findByText("Haircut"));
    await user.click(await screen.findByRole("button", { name: "Repeat" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeat" }), "WEEKLY");
    expect(screen.getByRole("group", { name: "Repeat on" })).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Next date counted from" }),
      "completion",
    );
    expect(screen.queryByRole("group", { name: "Repeat on" })).toBeNull();
    expect(screen.getByText("Every week after completion")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await screen.findByRole("button", { name: "Every week after completion" });
    const patch = api.state.requests.find((r) => r.method === "PATCH");
    expect(patch?.body).toEqual({ rrule: "FREQ=WEEKLY", repeat_from: "completion" });
  });

  it("skips one date of a repeating todo, and Ctrl+Z puts the date back", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({
      id: "01a11c71-6563-773d-8602-c5617ab6aa07",
      title: "Bins",
      due_date: "2026-10-08",
      rrule: "FREQ=DAILY",
      recurrence_anchor: "2026-10-08",
    });
    const api = open("/todos/today", createFakeTodoApi({ todos: [todo] }));

    await user.click(await screen.findByText("Bins"));
    await user.click(await screen.findByRole("button", { name: "Skip" }));

    expect((await screen.findAllByText("Next one: Tomorrow")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(api.state.todos[0]?.due_date).toBe("2026-10-09");
    });
    expect(api.state.todos[0]?.completed_at).toBeNull();

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => {
      expect(api.state.todos[0]?.due_date).toBe("2026-10-08");
    });
    expect(api.state.todos[0]?.rrule).toBe("FREQ=DAILY");
  });

  it("opens details with one click on the row, but not from its checkbox", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa04", title: "Call mum" });
    open("/todos/inbox", createFakeTodoApi({ todos: [todo] }));

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Call mum”" }));
    expect(screen.queryByRole("complementary", { name: "Details" })).toBeNull();

    await showCompleted(user);
    await user.click(
      within(await screen.findByRole("list", { name: "Completed today" })).getByText("Call mum"),
    );
    expect(await screen.findByRole("complementary", { name: "Details" })).toBeInTheDocument();

    // Clicking empty space in the view closes it again.
    await user.click(screen.getByRole("heading", { name: "Inbox", level: 1 }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Details" })).toBeNull();
    });
    // ...and clears the row's highlight with it.
    expect(todoUi.get().selectedId).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Completed today" }))
        .getByText("Call mum")
        .closest("[aria-current]"),
    ).toBeNull();
  });

  it("keeps Completed collapsed by default and remembers opening it per view", async () => {
    const user = userEvent.setup();
    const todos = [
      makeTodo({ title: "Fed cat", completed_at: "2026-10-08T08:00:00.000Z" }),
      makeTodo({
        title: "Paid rent",
        due_date: "2026-10-08",
        completed_at: "2026-10-08T09:00:00.000Z",
      }),
    ];
    open("/todos/inbox", createFakeTodoApi({ todos }));

    const toggle = await screen.findByRole("button", { name: /^Completed today/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Completed today" })).toBeNull();
    await user.click(toggle);
    expect(rowTitles("Completed today")).toEqual(["Fed cat", "Paid rent"]);

    // Today has its own, still collapsed, group.
    await user.click(screen.getByRole("link", { name: /Today/ }));
    await screen.findByRole("heading", { name: "Today", level: 1 });
    expect(screen.getByRole("button", { name: /^Completed today/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Back in the Inbox it is still open.
    await user.click(screen.getByRole("link", { name: /Inbox/ }));
    await screen.findByRole("heading", { name: "Inbox", level: 1 });
    expect(rowTitles("Completed today")).toEqual(["Fed cat", "Paid rent"]);
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

  it("reorders Today with Alt+↓ and keeps the order on the server; Ctrl+Z restores it", async () => {
    const user = userEvent.setup();
    const todos = [
      makeTodo({ title: "Urgent", due_date: "2026-10-08", priority: 3 }),
      makeTodo({ title: "Small", due_date: "2026-10-08", priority: 1 }),
      makeTodo({ title: "Errand", due_date: "2026-10-08", list_id: "L" }),
    ];
    const api = open("/todos/today", createFakeTodoApi({ todos }));
    await waitFor(() => {
      expect(rowTitles("Due today")).toEqual(["Urgent", "Small", "Errand"]);
    });

    await user.keyboard("{ArrowDown}{Alt>}{ArrowDown}{/Alt}");

    await waitFor(() => {
      expect(rowTitles("Due today")).toEqual(["Small", "Urgent", "Errand"]);
    });
    const order = (title: string) => api.state.todos.find((t) => t.title === title)?.today_position;
    await waitFor(() => {
      expect(order("Small")! < order("Urgent")!).toBe(true);
    });

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => {
      expect(rowTitles("Due today")).toEqual(["Urgent", "Small", "Errand"]);
    });
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

  it("gives a subtask a due date from the parent's checklist", async () => {
    const user = userEvent.setup();
    const parent = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa31", title: "Trip" });
    const child = makeTodo({
      id: "01a11c71-6563-773d-8602-c5617ab6aa32",
      title: "Book hotel",
      parent_id: parent.id,
      position: "a1",
    });
    const api = open("/todos/inbox", createFakeTodoApi({ todos: [parent, child] }));

    await user.click(await screen.findByText("Trip"));
    const checklist = await screen.findByRole("region", { name: "Subtasks" });
    await user.click(
      within(checklist).getByRole("button", { name: "Add due date to “Book hotel”" }),
    );
    await user.click(await screen.findByRole("button", { name: "Tomorrow" }));

    await waitFor(() => {
      const patch = api.state.requests.find(
        (r) => r.method === "PATCH" && r.path === `/api/todos/items/${child.id}`,
      );
      expect(patch?.body).toEqual({ due_date: "2026-10-09" });
    });
    expect(within(checklist).getByRole("button", { name: "Due Tomorrow" })).toBeInTheDocument();
  });

  it("opens the tag picker for the selected todo with L", async () => {
    const user = userEvent.setup();
    const todo = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa41", title: "Report" });
    const tag = {
      id: "01a11c71-6563-773d-8602-c5617ab6aa42",
      name: "work",
      created_at: "2026-10-01T08:00:00.000Z",
      updated_at: "2026-10-01T08:00:00.000Z",
    };
    const api = open("/todos/inbox", createFakeTodoApi({ todos: [todo], tags: [tag] }));
    await screen.findByRole("checkbox", { name: "Complete “Report”" });

    await user.keyboard("{ArrowDown}l");
    const find = await screen.findByPlaceholderText("Find or create a tag…");
    await waitFor(() => {
      expect(find).toHaveFocus();
    });
    await user.keyboard("work{Enter}");

    await waitFor(() => {
      const patch = api.state.requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ tag_ids: [tag.id] });
    });
  });

  it("adds the typed todo when the field loses focus, and ✕ discards", async () => {
    const user = userEvent.setup();
    // jsdom reports no focus once the field blurs to the body; a browser
    // window that keeps focus says true.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const api = open("/todos/inbox");

    await user.click(await screen.findByRole("button", { name: "Add todo" }));
    await user.type(screen.getByRole("textbox", { name: "New todo" }), "Call Bob");
    await user.click(screen.getByRole("heading", { name: "Inbox" }));

    await waitFor(() => {
      expect(rowTitles("Inbox")).toEqual(["Call Bob"]);
    });
    expect(screen.queryByRole("textbox", { name: "New todo" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add todo" }));
    await user.type(screen.getByRole("textbox", { name: "New todo" }), "Never mind");
    await user.click(screen.getByRole("button", { name: "Discard new todo" }));

    expect(screen.queryByRole("textbox", { name: "New todo" })).toBeNull();
    expect(rowTitles("Inbox")).toEqual(["Call Bob"]);
    expect(
      api.state.requests.filter((r) => r.method === "POST" && r.path === "/api/todos/items"),
    ).toHaveLength(1);
  });

  it("shows every open todo on All todos (G A) with the totals", async () => {
    const user = userEvent.setup();
    const parent = makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa51", title: "Plan trip" });
    const todos = [
      parent,
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa52", title: "Visa", parent_id: parent.id }),
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6aa53", title: "Call mum" }),
    ];
    open("/todos/today", createFakeTodoApi({ todos }));
    const link = await screen.findByRole("link", { name: /All todos/ });
    await waitFor(() => {
      expect(within(link).getByText("2")).toBeInTheDocument();
    });

    await user.keyboard("ga");

    expect(await screen.findByRole("heading", { name: "All todos" })).toBeInTheDocument();
    expect(screen.getByText("2 open todos · 1 open subtask · 1 place")).toBeInTheDocument();
    expect(rowTitles("Inbox")).toEqual(["Plan trip", "Call mum"]);
  });
});
