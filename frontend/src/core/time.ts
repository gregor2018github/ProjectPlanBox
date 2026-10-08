/**
 * Calendar helpers. "Today" is decided in the configured zone from
 * GET /api/meta, never the browser's zone, so every device agrees.
 * Date-only values are floating `YYYY-MM-DD` strings (see ARCHITECTURE §4).
 */
import { TZDate } from "@date-fns/tz";
import {
  addDays as addDaysFns,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";

/** A floating calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** ISO weekday the week starts on (1 = Monday), matching the backend. */
export const WEEK_STARTS_ON = 1;

/** Returns today's date in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return format(new TZDate(now, timeZone), "yyyy-MM-dd");
}

/** Returns the Monday of the week containing `date`. */
export function startOfWeekOf(date: IsoDate): IsoDate {
  return format(startOfWeek(parseISO(date), { weekStartsOn: WEEK_STARTS_ON }), "yyyy-MM-dd");
}

/** Formats a date as "Thursday, 8 October". */
export function formatDayLong(date: IsoDate): string {
  return format(parseISO(date), "EEEE, d MMMM");
}

/** Formats a date as "Thu 8 Oct". */
export function formatDayShort(date: IsoDate): string {
  return format(parseISO(date), "EEE d MMM");
}

/** The UTC instant at which `date` starts in `timeZone`, as ISO-8601. */
export function startOfDayUtc(date: IsoDate, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(new TZDate(year, month - 1, day, timeZone).getTime()).toISOString();
}

/** Adds (or subtracts) whole days to a floating date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return format(addDaysFns(parseISO(date), days), "yyyy-MM-dd");
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/** ISO weekday 1 (Monday) .. 7 (Sunday). */
export function isoWeekday(date: IsoDate): number {
  const day = parseISO(date).getDay();
  return day === 0 ? 7 : day;
}

/**
 * A short, human label relative to today: "Today", "Tomorrow", "Yesterday",
 * a weekday within the next 6 days, else "Thu 8 Oct" (plus the year when it differs).
 */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(parseISO(date), "EEEE");
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return format(parseISO(date), sameYear ? "EEE d MMM" : "d MMM yyyy");
}
