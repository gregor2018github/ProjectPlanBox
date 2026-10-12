/**
 * The simple schedules the habit panel edits directly: "on these weekdays,
 * every week". Anything else (every 2 days, monthly, an end date) is left to
 * the full repeat editor.
 */
import { parseRule, WEEKDAYS, type Weekday } from "../../core/recurrence/recurrence";
import type { IsoDate } from "../../core/time";

/**
 * The weekdays a rule falls on when it is a plain daily or weekly rule
 * (interval 1, no end); null for anything else.
 */
export function weekdaysOf(rule: string, start: IsoDate, timeZone: string): Weekday[] | null {
  const spec = parseRule(rule, start, timeZone);
  if (spec?.interval !== 1 || spec.end.kind !== "never") return null;
  if (spec.freq === "DAILY") return [...WEEKDAYS];
  if (spec.freq === "WEEKLY") return WEEKDAYS.filter((d) => spec.byDay.includes(d));
  return null;
}

/** The rule for "every week on these days": daily when all seven are on. */
export function ruleOfWeekdays(days: readonly Weekday[]): string {
  const sorted = WEEKDAYS.filter((d) => days.includes(d));
  return sorted.length === WEEKDAYS.length ? "FREQ=DAILY" : `FREQ=WEEKLY;BYDAY=${sorted.join(",")}`;
}
