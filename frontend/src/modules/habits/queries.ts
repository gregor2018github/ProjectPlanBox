import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";
import type { IsoDate } from "../../core/time";
import { useToday } from "../../core/useToday";
import { habitRange } from "./days";
import type { Habit } from "./types";

/** Query keys of the habits module. */
export const habitKeys = {
  all: ["habits"] as const,
  list: (start: IsoDate, end: IsoDate) => ["habits", "list", start, end] as const,
};

const EMPTY: Habit[] = [];

/** What every habit view reads: the habits with their recent days, and today. */
export interface HabitData {
  habits: Habit[];
  today: IsoDate | null;
  /** True until the habits have loaded the first time. */
  loading: boolean;
}

/**
 * Every live habit with the last 26 weeks of days and its streaks (one cache
 * for all views). Waits for the server's timezone to know today.
 */
export function useHabitData(): HabitData {
  const client = useApiClient();
  const today = useToday();
  const range = habitRange(today ?? "2000-01-03");
  const query = useQuery({
    queryKey: habitKeys.list(range.start, range.end),
    queryFn: () => unwrap(client.GET("/api/habits/habits", { params: { query: range } })),
    enabled: today !== null,
  });
  return { habits: query.data ?? EMPTY, today, loading: query.isPending };
}
