import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calendarModule } from "../modules/calendar";
import { makeEvent } from "../modules/calendar/testData";
import { calendarUi } from "../modules/calendar/uiStore";
import { habitsModule } from "../modules/habits";
import { knowledgeModule } from "../modules/knowledge";
import { makeEntry } from "../modules/knowledge/testData";
import { todosModule } from "../modules/todos";
import { makeTodo } from "../modules/todos/testData";
import { todoUi } from "../modules/todos/uiStore";
import { createFakeCalendarApi } from "./fakeCalendarApi";
import { createFakeHabitsApi, makeFakeHabit } from "./fakeHabitsApi";
import { createFakeKnowledgeApi } from "./fakeKnowledgeApi";
import { createFakeTodoApi } from "./fakeTodoApi";
import { renderApp, useDesktopViewport } from "./renderApp";

const TODAY = "2026-10-08";

beforeEach(() => {
  useDesktopViewport();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  // Thursday 8 October 2026, 12:00 in Amsterdam.
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  todoUi.reset();
  calendarUi.reset();
});

/** Renders Home with every module, each with a little data. */
function openHome() {
  const todos = createFakeTodoApi({
    todos: [
      makeTodo({ id: "t1", title: "File taxes", due_date: "2026-10-05" }),
      makeTodo({ id: "t2", title: "Call mum", due_date: TODAY, position: "a1" }),
      makeTodo({ id: "t3", title: "Plan trip", due_date: "2026-10-10", position: "a2" }),
      makeTodo({ id: "t4", title: "Someday", position: "a3" }),
    ],
  });
  const knowledge = createFakeKnowledgeApi(
    { entries: [makeEntry({ title: "Sourdough recipe" })] },
    todos.fetch,
  );
  const habits = createFakeHabitsApi(
    { habits: [makeFakeHabit("Stretch", "2026-10-01")], today: TODAY },
    knowledge.fetch,
  );
  const calendar = createFakeCalendarApi([makeEvent({ title: "Standup" })], habits.fetch);
  renderApp({
    path: "/",
    fetch: calendar.fetch,
    modules: [todosModule, knowledgeModule, calendarModule, habitsModule],
  });
  return { todos, habits };
}

const card = (name: string) => screen.getByRole("region", { name });

describe("home", () => {
  it("gives an overview across modules, todos first", async () => {
    openHome();

    const todos = await screen.findByRole("region", { name: "Todos" });
    await within(todos).findByText("File taxes");
    expect(within(todos).getByRole("list", { name: "Overdue" })).toHaveTextContent("File taxes");
    expect(within(todos).getByRole("list", { name: "Due today" })).toHaveTextContent("Call mum");
    expect(within(todos).queryByText("Plan trip")).not.toBeInTheDocument();
    expect(within(todos).getByRole("link", { name: /Next 7 days/ })).toHaveTextContent("1");
    expect(within(todos).getByRole("link", { name: /Inbox/ })).toHaveTextContent("4");
    expect(within(todos).getByText("2 to do today · 0 done")).toBeInTheDocument();

    expect(await within(card("Calendar")).findByText("Standup")).toBeInTheDocument();
    expect(await within(card("Habits")).findByText("0 of 1 done today")).toBeInTheDocument();
    expect(await within(card("Knowledge")).findByText("Sourdough recipe")).toBeInTheDocument();
    expect(within(card("Knowledge")).getByRole("link", { name: "1 entry to sort" })).toBeVisible();

    const order = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"))
      .filter((id) => id?.startsWith("home-"));
    expect(order).toEqual([
      "home-todos",
      "home-calendar",
      "home-habits",
      "home-knowledge",
      "home-last-7-days",
    ]);
  });

  it("completes a todo and ticks a habit in place", async () => {
    const user = userEvent.setup();
    const { todos, habits } = openHome();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Call mum”" }));
    await waitFor(() => {
      expect(within(card("Todos")).getByText("1 to do today · 1 done")).toBeInTheDocument();
    });
    expect(
      todos.state.requests.some((r) => r.method === "POST" && r.path.endsWith("/t2/complete")),
    ).toBe(true);

    await user.click(await screen.findByRole("checkbox", { name: "Done today: “Stretch”" }));
    expect(await within(card("Habits")).findByText("All done today")).toBeInTheDocument();
    expect(habits.state.requests.some((r) => r.method === "PUT")).toBe(true);
  });

  it("leads from a card's title to its full view", async () => {
    const user = userEvent.setup();
    openHome();

    await user.click(await screen.findByRole("link", { name: "Todos" }));

    expect(await screen.findByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
  });
});
