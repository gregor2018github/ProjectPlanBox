/**
 * Pure cache edits for optimistic habit mutations. The server recomputes
 * scheduled days and streaks; these edits only approximate them until the
 * refetch that follows every mutation.
 */
import type { IsoDate } from "../../core/time";
import { DEFAULT_RULE, type Habit, type HabitDay, type HabitPatch, type HabitRow } from "./types";

/** Variables of a create. */
export interface CreateHabitVars {
  id: string;
  name: string;
}

/** A new habit as it should look until the server answers (daily, from today; appended). */
export function buildHabit(vars: CreateHabitVars, today: IsoDate, now: string): Habit {
  return {
    id: vars.id,
    name: vars.name,
    notes: "",
    rrule: DEFAULT_RULE,
    start_date: today,
    position: "",
    created_at: now,
    updated_at: now,
    checkins: [],
    scheduled: [today],
    days_off: [],
    days_off_ahead: [],
    current_streak: 0,
    best_streak: 0,
    total_checkins: 0,
  };
}

/** Applies a patch to one habit. */
export function applyPatch(habits: readonly Habit[], id: string, patch: HabitPatch): Habit[] {
  return habits.map((h) => {
    if (h.id !== id) return h;
    return {
      ...h,
      ...(patch.name != null && { name: patch.name }),
      ...(patch.notes != null && { notes: patch.notes }),
      ...(patch.rrule != null && { rrule: patch.rrule }),
      ...(patch.start_date != null && { start_date: patch.start_date }),
    };
  });
}

/** Writes a server row back, keeping the cached days and streaks. */
export function mergeRow(habits: readonly Habit[], row: HabitRow): Habit[] {
  return habits.map((h) => (h.id === row.id ? { ...h, ...row } : h));
}

/**
 * Checks or unchecks a day. Checking a scheduled today extends the current
 * streak at once; other streak effects wait for the server.
 */
export function applyChecked(
  habits: readonly Habit[],
  id: string,
  day: IsoDate,
  checked: boolean,
  today: IsoDate,
): Habit[] {
  return habits.map((h) => {
    if (h.id !== id || h.checkins.includes(day) === checked) return h;
    const checkins = checked ? [...h.checkins, day].sort() : h.checkins.filter((d) => d !== day);
    const countsToday = day === today && h.scheduled.includes(day);
    const current = countsToday
      ? Math.max(0, h.current_streak + (checked ? 1 : -1))
      : h.current_streak;
    return {
      ...h,
      checkins,
      total_checkins: h.total_checkins + (checked ? 1 : -1),
      current_streak: current,
      best_streak: Math.max(h.best_streak, current),
    };
  });
}

/** Removes a habit. */
export function applyDelete(habits: readonly Habit[], id: string): Habit[] {
  return habits.filter((h) => h.id !== id);
}

/**
 * Takes days off (or back). A day off also leaves the scheduled days; a day
 * back waits for the refetch, since only the server expands schedules.
 */
export function applyDaysOff(
  habits: readonly Habit[],
  items: readonly HabitDay[],
  off: boolean,
  today: IsoDate,
): Habit[] {
  return habits.map((h) => {
    const days = new Set(items.filter((i) => i.habit_id === h.id).map((i) => i.day));
    if (days.size === 0) return h;
    const change = (list: readonly string[], keep: (day: string) => boolean) =>
      off
        ? [...new Set([...list, ...[...days].filter(keep)])].sort()
        : list.filter((d) => !days.has(d));
    return {
      ...h,
      // Days outside the cached range drop out again with the refetch.
      days_off: change(h.days_off, () => true),
      days_off_ahead: change(h.days_off_ahead, (d) => d >= today),
      scheduled: off ? h.scheduled.filter((d) => !days.has(d)) : h.scheduled,
    };
  });
}
