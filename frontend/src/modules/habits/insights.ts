/**
 * Pure statistics over the cached habits (the last 26 weeks of days). A
 * scheduled day counts once it is over, or as soon as it is checked, so an
 * unchecked today never lowers a rate.
 */
import { addDays, isoWeekday, type IsoDate } from "../../core/time";
import { habitRange, HISTORY_WEEKS } from "./days";
import type { Habit } from "./types";

/** Scheduled days kept out of scheduled days that count. */
export interface Rate {
  done: number;
  due: number;
}

/** Scheduled days of a habit from `from` to today that count, and how many were done. */
export function habitRate(habit: Habit, today: IsoDate, from: IsoDate): Rate {
  const checked = new Set(habit.checkins);
  let done = 0;
  let due = 0;
  for (const day of habit.scheduled) {
    if (day < from || day > today) continue;
    const isChecked = checked.has(day);
    if (day === today && !isChecked) continue;
    due += 1;
    if (isChecked) done += 1;
  }
  return { done, due };
}

/** The last 30 days, today included. */
export function rate30(habit: Habit, today: IsoDate): Rate {
  return habitRate(habit, today, addDays(today, -29));
}

/** Adds rates up. */
export function sumRates(rates: readonly Rate[]): Rate {
  return rates.reduce((sum, r) => ({ done: sum.done + r.done, due: sum.due + r.due }), {
    done: 0,
    due: 0,
  });
}

/** Consistency per weekday (Monday first) over every cached day of every habit. */
export function weekdayRates(habits: readonly Habit[], today: IsoDate): Rate[] {
  const rates = Array.from({ length: 7 }, () => ({ done: 0, due: 0 }));
  const from = habitRange(today).start;
  for (const habit of habits) {
    const checked = new Set(habit.checkins);
    for (const day of habit.scheduled) {
      if (day < from || day > today || (day === today && !checked.has(day))) continue;
      const rate = rates[isoWeekday(day) - 1];
      if (!rate) continue;
      rate.due += 1;
      if (checked.has(day)) rate.done += 1;
    }
  }
  return rates;
}

/** Check-ins per cached week (Monday starts), oldest first, unscheduled days included. */
export function weeklyCheckins(
  habits: readonly Habit[],
  today: IsoDate,
): { start: IsoDate; count: number }[] {
  const { start } = habitRange(today);
  const weeks = Array.from({ length: HISTORY_WEEKS }, (_, w) => ({
    start: addDays(start, w * 7),
    count: 0,
  }));
  for (const habit of habits) {
    for (const day of habit.checkins) {
      const week = weeks.findLast((w) => w.start <= day);
      if (week && day <= today) week.count += 1;
    }
  }
  return weeks;
}
