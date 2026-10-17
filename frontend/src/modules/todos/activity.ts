/**
 * The Logbook's activity feed: each todo once, on the local day it was last
 * touched, marked by what happened that day (added, changed or completed).
 */
import { todayIn, type IsoDate } from "../../core/time";
import type { Todo } from "./types";

/** What happened to a todo on its activity day. */
export type ActivityKind = "added" | "changed" | "completed";

/** One day of activity: its todos by kind, newest first within each. */
export interface ActivityDay {
  day: IsoDate;
  groups: { kind: ActivityKind; todos: Todo[] }[];
}

const ORDER: readonly ActivityKind[] = ["added", "changed", "completed"];

/**
 * Groups todos by the local day of their last change, newest first.
 * Completing that day wins over adding; adding wins over changing.
 */
export function activityDays(todos: readonly Todo[], zone: string): ActivityDay[] {
  const dayOf = (iso: string) => todayIn(zone, new Date(iso));
  const days = new Map<IsoDate, Map<ActivityKind, Todo[]>>();
  const newestFirst = [...todos].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  for (const todo of newestFirst) {
    const day = dayOf(todo.updated_at);
    const kind: ActivityKind =
      todo.completed_at !== null && dayOf(todo.completed_at) === day
        ? "completed"
        : dayOf(todo.created_at) === day
          ? "added"
          : "changed";
    const byKind = days.get(day) ?? new Map<ActivityKind, Todo[]>();
    byKind.set(kind, [...(byKind.get(kind) ?? []), todo]);
    days.set(day, byKind);
  }
  return [...days.entries()].map(([day, byKind]) => ({
    day,
    groups: ORDER.flatMap((kind) => {
      const list = byKind.get(kind);
      return list ? [{ kind, todos: list }] : [];
    }),
  }));
}
