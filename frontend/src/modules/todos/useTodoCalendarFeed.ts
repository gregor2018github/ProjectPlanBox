import { useMemo } from "react";

import type { CalendarFeed, CalendarFeedEntry } from "../../core/calendar/feed";
import { useCalendarFeed } from "../../core/calendar/feedContext";
import type { Todo } from "./types";
import type { TodoActions } from "./useTodoActions";
import { todoItemRef } from "./useTodoActions";
import type { TodoData } from "./useTodoData";

const TONES: Record<number, CalendarFeedEntry["tone"]> = { 3: "danger", 2: "warning" };

/** Turns dated todos into calendar entries (pure, so it is tested without React). */
export function todoCalendarEntries(data: Pick<TodoData, "todos" | "lookup">): CalendarFeedEntry[] {
  return data.todos.flatMap((t: Todo) =>
    t.due_date === null
      ? []
      : [
          {
            ref: todoItemRef(t.id),
            title: t.title,
            date: t.due_date,
            done: t.completed_at !== null,
            tone: TONES[t.priority] ?? "default",
            context: data.lookup.todoTitle(t.parent_id) ?? data.lookup.listName(t.list_id),
          },
        ],
  );
}

/** Publishes the todos with a due date to the calendar, with reschedule and complete. */
export function useTodoCalendarFeed(data: TodoData, actions: TodoActions): void {
  const feed = useMemo<CalendarFeed>(() => {
    const byRef = new Map(data.todos.map((t) => [todoItemRef(t.id), t]));
    return {
      id: "todos",
      label: "Todos",
      entries: todoCalendarEntries(data),
      reschedule: (ref, date) => {
        const todo = byRef.get(ref);
        if (todo && todo.due_date !== date) actions.setDue(todo, date);
      },
      toggleDone: (ref) => {
        const todo = byRef.get(ref);
        if (todo) actions.toggleComplete(todo);
      },
    };
  }, [data, actions]);
  useCalendarFeed(feed);
}
