/** Pure date helpers for the habit views. */
import { addDays, startOfWeekOf, type IsoDate } from "../../core/time";
import type { Habit } from "./types";

/** How many weeks of history the cache (and the history grid) covers. */
export const HISTORY_WEEKS = 26;

/** How many days the week strip shows, ending today. */
export const STRIP_DAYS = 7;

/** The cached range: whole weeks (Monday first), the current week last. */
export function habitRange(today: IsoDate): { start: IsoDate; end: IsoDate } {
  const monday = startOfWeekOf(today);
  return { start: addDays(monday, -7 * (HISTORY_WEEKS - 1)), end: addDays(monday, 6) };
}

/** The `count` days ending with `last`, oldest first. */
export function daysEnding(last: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(last, i - count + 1));
}

/** The history grid's weeks: each a Monday-first list of seven days. */
export function historyWeeks(today: IsoDate): IsoDate[][] {
  const { start } = habitRange(today);
  return Array.from({ length: HISTORY_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}

/** What a day means for a habit. */
export type DayState = "done" | "missed" | "open" | "unscheduled" | "off" | "future";

/** Classifies one day of a habit relative to today. */
export function dayState(habit: Habit, day: IsoDate, today: IsoDate): DayState {
  if (habit.checkins.includes(day)) return "done";
  if (habit.days_off.includes(day) || habit.days_off_ahead.includes(day)) return "off";
  if (day > today) return "future";
  if (!habit.scheduled.includes(day)) return "unscheduled";
  return day === today ? "open" : "missed";
}

/** Whether the habit is scheduled today and not yet checked. */
export function isDueToday(habit: Habit, today: IsoDate): boolean {
  return habit.scheduled.includes(today) && !habit.checkins.includes(today);
}

/** A run of consecutive days, both ends inclusive. */
export interface DayRun {
  start: IsoDate;
  end: IsoDate;
}

/** Groups days into runs of consecutive days (a holiday reads as one range). */
export function dayRuns(days: readonly IsoDate[]): DayRun[] {
  const runs: DayRun[] = [];
  for (const day of [...new Set(days)].sort()) {
    const last = runs.at(-1);
    if (last !== undefined && addDays(last.end, 1) === day) last.end = day;
    else runs.push({ start: day, end: day });
  }
  return runs;
}

/** Every day from `start` to `end`, both inclusive (empty when reversed). */
export function daysBetweenInclusive(start: IsoDate, end: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}
