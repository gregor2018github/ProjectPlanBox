import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { Activity } from "../core/insights/activity";
import type { ModuleManifest } from "../core/module";
import { TodoInsights } from "../modules/todos/components/TodoInsights";
import type { TodoStats } from "../modules/todos/types";
import { defaultRoutes, fakeFetch, renderApp, useDesktopViewport } from "./renderApp";

// The real clock decides "today", so the activity days are relative to it.
const today = new Date().toISOString().slice(0, 10);

const activity: Activity = {
  start: "2025-10-06",
  end: today,
  days: [{ date: today, created: 3, completed: 2, deleted: 1, opens: 1 }],
  types: [{ entity_type: "todos.todo", created: 3, completed: 2, deleted: 1 }],
  opens: {
    in_range: 4,
    all_time: 4,
    first_at: "2026-10-01T08:00:00.000Z",
    by_hour: Array.from({ length: 24 }, (_, h) => (h === 9 ? 4 : 0)),
    by_weekday: [4, 0, 0, 0, 0, 0, 0],
  },
};

const card = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
card[1]![9] = 5;

const stats: TodoStats = {
  today,
  totals: {
    open: 12,
    overdue: 3,
    due_today: 2,
    due_next_7: 4,
    no_due_date: 5,
    inbox: 6,
    repeating: 1,
    subtasks_open: 2,
    completed: 40,
    subtasks_completed: 9,
    added: 55,
    deleted: 3,
  },
  recent: {
    added_7: 5,
    completed_7: 7,
    added_prev_7: 6,
    completed_prev_7: 4,
    added_30: 20,
    completed_30: 22,
    subtasks_completed_7: 2,
  },
  weeks: [{ start: "2026-10-05", added: 5, completed: 7, deleted: 0 }],
  lead_time: {
    count: 30,
    mean_days: 4.2,
    median_days: 1.5,
    p90_days: 12,
    buckets: [{ label: "Under a day", count: 10 }],
    by_priority: [{ priority: 3, count: 5, median_days: 0.5 }],
  },
  open_age: { median_days: 9, buckets: [{ label: "1–2 weeks", count: 4 }] },
  oldest_open: [
    { id: "t1", title: "Renew passport", created_at: "", age_days: 120, place: "Inbox" },
  ],
  priorities: [{ priority: 3, open: 2, completed: 9, overdue: 1 }],
  lists: [
    {
      id: "l1",
      name: "Garden",
      area_name: "Home",
      open: 7,
      overdue: 2,
      completed: 11,
      completed_30: 3,
    },
  ],
  areas: [{ id: "a1", name: "Home", open: 7, completed: 11 }],
  tags: [],
  punchcard: card,
  due: { with_due_date: 20, on_time: 15, late: 5, mean_days_late: 2 },
  streaks: {
    current: 3,
    longest: 9,
    active_days: 25,
    best_day: { date: "2026-09-14", count: 8 },
  },
};

const todosInsightsOnly: ModuleManifest = {
  id: "todos",
  label: "Todos",
  routes: () => [],
  InsightsSection: TodoInsights,
};

function renderInsights(calls: Request[] = []) {
  return renderApp({
    path: "/insights",
    modules: [todosInsightsOnly],
    fetch: fakeFetch(
      {
        ...defaultRoutes,
        "/api/insights/activity": activity,
        "/api/insights/opens": { id: "x", created_at: "" },
        "/api/todos/stats": stats,
        "/api/tags": [],
      },
      calls,
    ),
  });
}

describe("Insights page", () => {
  beforeEach(() => {
    useDesktopViewport();
  });

  it("shows the cross-module overview and records the app open", async () => {
    const calls: Request[] = [];
    renderInsights(calls);

    const overview = await screen.findByRole("region", { name: "Overview" });
    expect(await within(overview).findByText("Since 1 Oct 2026")).toBeInTheDocument();
    expect(within(overview).getByText("Todos")).toBeInTheDocument(); // module label from the manifest
    const readout = within(overview).getByText(/3 added · 2 completed · 1 deleted · 1 app open/);
    expect(readout).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/insights/opens"))).toBe(
        true,
      );
    });
  });

  it("renders each module's section with its numbers", async () => {
    renderInsights();

    const todos = await screen.findByRole("region", { name: "Todos" });
    expect(await within(todos).findByText("3 overdue · 2 due today")).toBeInTheDocument();
    expect(within(todos).getByText("2 subtasks · +3 vs the week before")).toBeInTheDocument();
    expect(within(todos).getByText(/40 completed \(9 of them subtasks\)/)).toBeInTheDocument();
    expect(within(todos).getByText("75 %")).toBeInTheDocument();
    expect(within(todos).getByRole("link", { name: /Garden/ })).toBeInTheDocument();
    expect(within(todos).getByText(/Peak: Tue around 09:00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("href", "#insights-todos");
  });

  it("reads chart columns with the keyboard", async () => {
    const user = userEvent.setup();
    renderInsights();

    const chart = await screen.findByRole("group", { name: /App opens by hour of day/ });
    chart.focus();
    await user.keyboard("{Home}");
    const caption = chart.closest("figure")!.querySelector("figcaption")!;
    expect(caption).toHaveTextContent("00:00–01:00 · Opens 0");
    for (let i = 0; i < 9; i += 1) await user.keyboard("{ArrowRight}");
    expect(caption).toHaveTextContent("09:00–10:00 · Opens 4");
  });
});
