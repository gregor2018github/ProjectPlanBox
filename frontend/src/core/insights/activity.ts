/**
 * Pure selectors for the cross-module activity overview (GET
 * /api/insights/activity): the year grid, active-day streaks and app opens.
 */
import type { components } from "../api/schema";
import {
  addDays,
  formatDayShort,
  formatMonthShort,
  startOfWeekOf,
  WEEKDAYS_SHORT,
  type IsoDate,
} from "../time";
import type { HeatColumn } from "../../ui/HeatGrid";
import { formatCount, plural } from "./format";

/** The activity overview for a date range. */
export type Activity = components["schemas"]["ActivityOut"];

/** What happened on one day. */
export type DayActivity = components["schemas"]["DayActivityOut"];

/** Weeks the year grid shows, the current one last. */
export const ACTIVITY_WEEKS = 53;

/** The range the overview asks for: whole weeks from a year ago up to today. */
export function activityRange(today: IsoDate): { start: IsoDate; end: IsoDate } {
  return { start: addDays(startOfWeekOf(today), -7 * (ACTIVITY_WEEKS - 1)), end: today };
}

/** Everything done on a day: added, completed and deleted (app opens excluded). */
export function dayTotal(day: DayActivity): number {
  return day.created + day.completed + day.deleted;
}

/** The readout of one day, e.g. "Thu 8 Oct 2026 · 5 added · 2 completed". */
export function describeDay(date: IsoDate, day: DayActivity | undefined): string {
  const title = `${formatDayShort(date)} ${date.slice(0, 4)}`;
  if (!day) return `${title} · Nothing`;
  const parts = [
    day.created > 0 && `${formatCount(day.created)} added`,
    day.completed > 0 && `${formatCount(day.completed)} completed`,
    day.deleted > 0 && `${formatCount(day.deleted)} deleted`,
    day.opens > 0 && plural(day.opens, "app open"),
  ].filter((part): part is string => part !== false);
  return [title, ...(parts.length > 0 ? parts : ["Nothing"])].join(" · ");
}

/**
 * The year grid: one column per week (Monday on top), days after today
 * blank, a month name above the week in which that month starts.
 */
export function activityColumns(days: readonly DayActivity[], today: IsoDate): HeatColumn[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const { start } = activityRange(today);
  const columns: HeatColumn[] = [];
  for (let w = 0; w < ACTIVITY_WEEKS; w += 1) {
    const dates = Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d));
    const first = dates.find((date) => date.endsWith("-01"));
    columns.push({
      key: dates[0] ?? String(w),
      tick: first === undefined ? undefined : formatMonthShort(first),
      cells: dates.map((date) => {
        if (date > today) return null;
        const found = byDate.get(date);
        return {
          key: date,
          value: found ? dayTotal(found) : 0,
          label: describeDay(date, found),
        };
      }),
    });
  }
  return columns;
}

/** Days in a row with something done, the longest run, and how many days had any. */
export interface ActiveStreaks {
  /** Up to today; an empty today does not break it until it is over. */
  current: number;
  longest: number;
  activeDays: number;
}

/** Counts active-day streaks (the same rule as the todo completion streak). */
export function activeStreaks(days: readonly DayActivity[], today: IsoDate): ActiveStreaks {
  const active = new Set(days.filter((d) => dayTotal(d) > 0).map((d) => d.date));
  let current = 0;
  let cursor = active.has(today) ? today : addDays(today, -1);
  while (active.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  let run = 0;
  let previous: IsoDate | null = null;
  for (const date of [...active].sort()) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest, activeDays: active.size };
}

/** Totals of what was done per weekday (Monday first). */
export function weekdayTotals(days: readonly DayActivity[]): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) {
    const weekday = (new Date(`${day.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    totals[weekday] = (totals[weekday] ?? 0) + dayTotal(day);
  }
  return totals;
}

/** The weekday with the most done, or null when nothing was. */
export function busiestWeekday(days: readonly DayActivity[]): string | null {
  const totals = weekdayTotals(days);
  const top = Math.max(...totals);
  return top > 0 ? (WEEKDAYS_SHORT[totals.indexOf(top)] ?? null) : null;
}
