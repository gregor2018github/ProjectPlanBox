/**
 * Calendar helpers. "Today" is decided in the configured zone from
 * GET /api/meta, never the browser's zone, so every device agrees.
 * Date-only values are floating `YYYY-MM-DD` strings (see ARCHITECTURE §4).
 */
import { TZDate } from "@date-fns/tz";
import { format, parseISO, startOfWeek } from "date-fns";

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
