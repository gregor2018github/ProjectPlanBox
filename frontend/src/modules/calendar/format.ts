/** How calendar items read: times, ranges and accessible names. */
import { format, parseISO } from "date-fns";

import {
  addDays,
  formatDayLong,
  formatDayShort,
  formatMinutes,
  MINUTES_PER_DAY,
  type IsoDate,
} from "../../core/time";
import type { DaySegment, EventItem } from "./types";

/** "09:00–10:30", or "All day". */
export function segmentTimeLabel(segment: DaySegment): string {
  if (segment.item.event.all_day) return "All day";
  if (segment.start === 0 && segment.end === MINUTES_PER_DAY) return "All day";
  return `${formatMinutes(segment.start)}–${formatMinutes(segment.end)}`;
}

/**
 * When a whole occurrence runs: like {@link segmentTimeLabel} for one day;
 * "Mon 15 Feb – Thu 18 Feb" or "Mon 15 Feb 06:00 – Thu 18 Feb 22:00" for several.
 */
export function occurrenceTimeLabel(segment: DaySegment): string {
  const { range } = segment;
  if (range.startDate === range.endDate) return segmentTimeLabel(segment);
  const first = formatDayShort(range.startDate);
  const last = formatDayShort(range.endDate);
  if (segment.item.event.all_day) return `${first} – ${last}`;
  return `${first} ${formatMinutes(range.start)} – ${last} ${formatMinutes(range.end)}`;
}

/**
 * "Standup, Monday, 12 October, 09:00–09:15" for screen readers; a multi-day
 * occurrence reads its whole range instead.
 */
export function segmentLabel(segment: DaySegment): string {
  const { range, item } = segment;
  if (range.startDate !== range.endDate) {
    return `${item.event.title}, ${occurrenceTimeLabel(segment)}`;
  }
  return `${item.event.title}, ${formatDayLong(segment.date)}, ${segmentTimeLabel(segment)}`;
}

/** Whether an occurrence belongs to a repeating series. */
export function isRecurring(item: EventItem): boolean {
  return item.event.rrule !== null;
}

/** A week's title: "5–11 October 2026", "28 Sep – 4 Oct 2026" or "28 Dec 2026 – 3 Jan 2027". */
export function formatWeekRange(first: IsoDate): string {
  const last = addDays(first, 6);
  const a = parseISO(first);
  const b = parseISO(last);
  if (first.slice(0, 7) === last.slice(0, 7))
    return `${format(a, "d")}–${format(b, "d MMMM yyyy")}`;
  if (first.slice(0, 4) === last.slice(0, 4))
    return `${format(a, "d MMM")} – ${format(b, "d MMM yyyy")}`;
  return `${format(a, "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`;
}

/** A day's title with its year: "Monday, 12 October 2026". */
export function formatDayTitle(date: IsoDate): string {
  return format(parseISO(date), "EEEE, d MMMM yyyy");
}
