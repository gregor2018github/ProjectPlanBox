import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { addDays, formatDayShort, todayIn } from "../core/time";
import { habitsModule } from "../modules/habits";
import { knowledgeModule } from "../modules/knowledge";
import { todosModule } from "../modules/todos";
import { createFakeHabitsApi, makeFakeHabit, type FakeHabit } from "./fakeHabitsApi";
import { createFakeKnowledgeApi } from "./fakeKnowledgeApi";
import { createFakeTodoApi } from "./fakeTodoApi";
import { installMatchMedia } from "./matchMedia";
import { renderApp, useDesktopViewport } from "./renderApp";

beforeEach(() => {
  useDesktopViewport();
  window.localStorage.clear();
});

const today = todayIn("Europe/Amsterdam");

function open(path: string, habits: FakeHabit[] = []) {
  const todos = createFakeTodoApi();
  const knowledge = createFakeKnowledgeApi({}, todos.fetch);
  const api = createFakeHabitsApi({ habits, today }, knowledge.fetch);
  renderApp({ path, fetch: api.fetch, modules: [todosModule, knowledgeModule, habitsModule] });
  return api;
}

describe("habits", () => {
  it("adds a habit from the page and opens it", async () => {
    const user = userEvent.setup();
    const api = open("/habits");
    await screen.findByText(/No habits yet/);

    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "New habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByRole("textbox"), "Stretch{Enter}");

    const list = await screen.findByRole("list", { name: "Habits" });
    expect(within(list).getByText("Stretch")).toBeInTheDocument();
    expect(api.state.requests.find((r) => r.method === "POST")?.body).toMatchObject({
      name: "Stretch",
    });
    const details = await screen.findByRole("complementary", { name: "Details" });
    expect(within(details).getByRole("textbox", { name: "Name" })).toHaveValue("Stretch");
  });

  it("checks off today in the week strip, updates the streak, and undoes it", async () => {
    const user = userEvent.setup();
    const yesterday = addDays(today, -1);
    const api = open("/habits", [makeFakeHabit("Read", addDays(today, -5), [yesterday])]);

    const day = await screen.findByRole("button", { name: `Read on ${formatDayShort(today)}` });
    expect(day).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Current streak: 1")).toBeInTheDocument();

    await user.click(day);

    expect(day).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByLabelText("Current streak: 2")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.state.habits[0]?.checkins).toContain(today);
    });

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => {
      expect(api.state.habits[0]?.checkins).not.toContain(today);
    });
    expect(day).toHaveAttribute("aria-pressed", "false");
  });

  it("ticks today's habits off in the rail pane (H)", async () => {
    const user = userEvent.setup();
    const api = open("/todos/inbox", [makeFakeHabit("Water plants", today)]);
    await screen.findByRole("navigation", { name: "Panels" });

    await user.keyboard("h");
    const pane = await screen.findByRole("list", { name: "Today's habits" });
    await user.click(within(pane).getByRole("checkbox", { name: "Done today: “Water plants”" }));

    await waitFor(() => {
      expect(api.state.habits[0]?.checkins).toEqual([today]);
    });
  });

  it("closes the floating pane when a habit opens from it (narrower than 1280 px)", async () => {
    installMatchMedia((query) => query.includes("768px"));
    const user = userEvent.setup();
    open("/todos/inbox", [makeFakeHabit("Water plants", today)]);
    await screen.findByRole("navigation", { name: "Panels" });

    await user.keyboard("h");
    const pane = await screen.findByRole("list", { name: "Today's habits" });
    await user.click(within(pane).getByRole("button", { name: "Water plants" }));

    const details = await screen.findByRole("complementary", { name: "Details" });
    expect(await within(details).findByRole("textbox", { name: "Name" })).toHaveValue(
      "Water plants",
    );
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Today's habits" })).not.toBeInTheDocument();
    });
  });

  it("deletes a habit from the detail panel, with undo", async () => {
    const user = userEvent.setup();
    const habit = makeFakeHabit("Journal", today);
    const api = open(`/habits?item=habits.habit:${habit.row.id}`, [habit]);

    const details = await screen.findByRole("complementary", { name: "Details" });
    await user.click(await within(details).findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Habits" })).not.toBeInTheDocument();
    });
    expect(api.state.habits[0]?.deleted).toBe(true);

    await user.keyboard("{Control>}z{/Control}");
    const list = await screen.findByRole("list", { name: "Habits" });
    expect(within(list).getByText("Journal")).toBeInTheDocument();
  });
});
