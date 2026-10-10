import { useMemo } from "react";

import type { CalendarFeed, CalendarFeedEntry } from "../../core/calendar/feed";
import { useCalendarFeed, useCalendarRanges } from "../../core/calendar/feedContext";
import { useForecast } from "./queries";
import type { Forecast, Todo } from "./types";
import type { TodoActions } from "./useTodoActions";
import { todoItemRef } from "./useTodoActions";
import type { TodoData } from "./useTodoData";

const TONES: Record<number, CalendarFeedEntry["tone"]> = { 3: "danger", 2: "warning" };

function entryOf(
  t: Todo,
  date: string,
  lookup: TodoData["lookup"],
): Omit<CalendarFeedEntry, "done"> {
  return {
    ref: todoItemRef(t.id),
    title: t.title,
    date,
    tone: TONES[t.priority] ?? "default",
    context: lookup.todoTitle(t.parent_id) ?? lookup.listName(t.list_id),
  };
}

/**
 * Turns dated todos into calendar entries, plus the later dates of open
 * repeating ones as projected entries (pure, so it is tested without React).
 */
export function todoCalendarEntries(
  data: Pick<TodoData, "todos" | "lookup">,
  forecast: readonly Forecast[] = [],
): CalendarFeedEntry[] {
  const dated = data.todos.flatMap((t: Todo) =>
    t.due_date === null
      ? []
      : [{ ...entryOf(t, t.due_date, data.lookup), done: t.completed_at !== null }],
  );
  const open = new Map(
    data.todos.filter((t) => t.rrule !== null && t.completed_at === null).map((t) => [t.id, t]),
  );
  const projected = forecast.flatMap((f) => {
    const t = open.get(f.todo_id);
    return t === undefined || f.date === t.due_date
      ? []
      : [{ ...entryOf(t, f.date, data.lookup), done: false, projected: true }];
  });
  return [...dated, ...projected];
}

/**
 * Publishes the todos with a due date to the calendar, with reschedule and
 * complete, and the later dates of repeating ones in the ranges it shows.
 */
export function useTodoCalendarFeed(data: TodoData, actions: TodoActions): void {
  const forecast = useForecast(useCalendarRanges());
  const feed = useMemo<CalendarFeed>(() => {
    const byRef = new Map(data.todos.map((t) => [todoItemRef(t.id), t]));
    return {
      id: "todos",
      label: "Todos",
      entries: todoCalendarEntries(data, forecast),
      reschedule: (ref, date) => {
        const todo = byRef.get(ref);
        if (todo && todo.due_date !== date) actions.setDue(todo, date);
      },
      toggleDone: (ref) => {
        const todo = byRef.get(ref);
        if (todo) actions.toggleComplete(todo);
      },
    };
  }, [data, actions, forecast]);
  useCalendarFeed(feed);
}
