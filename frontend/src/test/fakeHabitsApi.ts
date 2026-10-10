/**
 * An in-memory stand-in for the habits API, good enough for UI tests. Every
 * habit is treated as daily (pytest covers real schedules and streaks).
 * Requests it does not know go to `fallback`.
 */
import type { FetchFn } from "../core/api/client";
import { addDays } from "../core/time";
import type { Habit, HabitRow } from "../modules/habits/types";

/** One stored habit: its row and its checked days. */
export interface FakeHabit {
  row: HabitRow;
  checkins: string[];
  deleted?: boolean;
}

/** The fake server's state, inspectable by tests. */
export interface FakeHabitsState {
  habits: FakeHabit[];
  requests: { method: string; path: string; body: unknown }[];
  today: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

function problem(status: number, detail: string): Response {
  return json({ type: "about:blank", title: "Error", status, detail, code: "test" }, status);
}

function daysFrom(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

function overview(habit: FakeHabit, start: string, end: string, today: string): Habit {
  const first = habit.row.start_date;
  let run = 0;
  let best = 0;
  for (const day of daysFrom(first, today)) {
    if (habit.checkins.includes(day)) {
      run += 1;
      best = Math.max(best, run);
    } else if (day < today) run = 0;
  }
  return {
    ...habit.row,
    checkins: habit.checkins.filter((d) => d >= start && d <= end).sort(),
    scheduled: daysFrom(first > start ? first : start, end),
    current_streak: run,
    best_streak: best,
    total_checkins: habit.checkins.length,
  };
}

/** Builds a stored habit (daily, starting `start`). */
export function makeFakeHabit(name: string, start: string, checkins: string[] = []): FakeHabit {
  const stamp = "2026-10-01T10:00:00.000Z";
  return {
    row: {
      id: `habit-${name.toLowerCase().replace(/\W+/g, "-")}`,
      name,
      notes: "",
      rrule: "FREQ=DAILY",
      start_date: start,
      position: "a0",
      created_at: stamp,
      updated_at: stamp,
    },
    checkins,
  };
}

/** Creates a fake habits API in front of `fallback`. */
export function createFakeHabitsApi(
  seed: Partial<FakeHabitsState> & { today: string },
  fallback?: FetchFn,
) {
  const state: FakeHabitsState = { habits: [], requests: [], ...seed };
  const live = () => state.habits.filter((h) => h.deleted !== true);

  const fetch: FetchFn = async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/habits")) {
      return fallback ? fallback(request) : problem(404, path);
    }
    const method = request.method;
    const text = method === "GET" ? "" : await request.text();
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    state.requests.push({ method, path, body });
    const b = (body ?? {}) as Record<string, unknown>;
    // ["api", "habits", "habits", id, "checkins" | "restore", day]
    const [, , , id, action, day] = path.split("/").filter(Boolean);

    if (id === undefined && method === "GET") {
      const start = url.searchParams.get("start") ?? state.today;
      const end = url.searchParams.get("end") ?? state.today;
      return json(live().map((h) => overview(h, start, end, state.today)));
    }
    if (id === undefined && method === "POST") {
      const habit = makeFakeHabit(String(b.name), state.today);
      habit.row.id = String(b.id);
      state.habits.push(habit);
      return json(habit.row, 201);
    }
    const habit = state.habits.find((h) => h.row.id === id);
    if (habit === undefined) return problem(404, "No habit with this id.");
    if (action === "restore") {
      habit.deleted = false;
      return json(habit.row);
    }
    if (habit.deleted === true) return problem(404, "No habit with this id.");
    if (action === "checkins" && day !== undefined) {
      const checked = method === "PUT";
      habit.checkins = habit.checkins.filter((d) => d !== day);
      if (checked) habit.checkins.push(day);
      return json({ habit_id: habit.row.id, day, checked });
    }
    if (method === "PATCH") {
      Object.assign(habit.row, b);
      return json(habit.row);
    }
    if (method === "DELETE") {
      habit.deleted = true;
      return json({ id: habit.row.id, deleted_at: "2026-10-08T12:00:00.000Z" });
    }
    return problem(404, path);
  };

  return { state, fetch };
}
