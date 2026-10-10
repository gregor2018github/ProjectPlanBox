/** Aliases of the generated backend types for the habits module. */
import type { components } from "../../core/api/schema";

/** A habit with its days in the cached range and its streaks. */
export type Habit = components["schemas"]["HabitOverviewOut"];

/** A habit row as mutations return it (no days, no streaks). */
export type HabitRow = components["schemas"]["HabitOut"];

/** Changes to a habit. */
export type HabitPatch = components["schemas"]["HabitPatch"];

/** The entity type habits have in links, search and `?item=`. */
export const HABIT_TYPE = "habits.habit";

/** The rule new habits get: every day. */
export const DEFAULT_RULE = "FREQ=DAILY";

/** The entity reference of a habit, e.g. for the `?item=` search param. */
export function habitRef(id: string): string {
  return `${HABIT_TYPE}:${id}`;
}
