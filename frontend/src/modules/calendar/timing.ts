/**
 * Event timing in the configured zone: where an event or occurrence starts,
 * how long it lasts, and how an occurrence moves when its series changes.
 * Timed values are UTC instants; all-day values floating dates (end inclusive).
 */
import { addDays, daysBetween, zonedInstant, zonedParts, type IsoDate } from "../../core/time";
import type { CalendarEvent, Occurrence, Timing } from "./types";

/** The timing of an event (the anchor of a series) or an occurrence. */
export function timingOf(source: Timing): Timing {
  return {
    all_day: source.all_day,
    start_at: source.start_at,
    end_at: source.end_at,
    start_date: source.start_date,
    end_date: source.end_date,
  };
}

/** The timing of one occurrence (its event says whether it is all-day). */
export function occurrenceTiming(event: CalendarEvent, occurrence: Occurrence): Timing {
  return { ...occurrence, all_day: event.all_day };
}

/** Local start date. */
export function startDate(t: Timing, timeZone: string): IsoDate {
  if (t.all_day) return t.start_date ?? "";
  return zonedParts(t.start_at ?? "", timeZone).date;
}

/** Local start in minutes since midnight (0 for all-day). */
export function startMinutes(t: Timing, timeZone: string): number {
  return t.all_day ? 0 : zonedParts(t.start_at ?? "", timeZone).minutes;
}

/** Duration in milliseconds (timed) or the number of extra days (all-day). */
function length(t: Timing): number {
  if (t.all_day) return daysBetween(t.start_date ?? "", t.end_date ?? "");
  return Date.parse(t.end_at ?? "") - Date.parse(t.start_at ?? "");
}

/** Builds a timing of the same kind and length as `shape`, starting on `date` at `shape`'s time. */
export function placeLike(shape: Timing, date: IsoDate, timeZone: string): Timing {
  if (shape.all_day) {
    return {
      all_day: true,
      start_at: null,
      end_at: null,
      start_date: date,
      end_date: addDays(date, length(shape)),
    };
  }
  const start = zonedInstant(date, startMinutes(shape, timeZone), timeZone);
  return {
    all_day: false,
    start_at: start,
    end_at: new Date(Date.parse(start) + length(shape)).toISOString(),
    start_date: null,
    end_date: null,
  };
}

/** The only occurrence of a single (non-recurring) event. */
export function singleOccurrence(event: CalendarEvent, timeZone: string): Occurrence {
  return {
    event_id: event.id,
    occurrence_date: startDate(event, timeZone),
    start_at: event.start_at,
    end_at: event.end_at,
    start_date: event.start_date,
    end_date: event.end_date,
  };
}

/**
 * Where an occurrence of `before` lands once its series becomes `after`:
 * shifted by the same number of days, at `after`'s time and length.
 */
export function retime(
  occurrence: Occurrence,
  before: Timing,
  after: Timing & { id: string },
  timeZone: string,
): Occurrence {
  const shift = daysBetween(startDate(before, timeZone), startDate(after, timeZone));
  const date = addDays(occurrence.occurrence_date, shift);
  return { ...placeLike(after, date, timeZone), event_id: after.id, occurrence_date: date };
}

/**
 * The series timing that moves every occurrence the way one occurrence was
 * moved: the series start shifts by the same amount; the length is the new one.
 */
export function seriesTimingFor(
  series: Timing,
  before: Timing,
  after: Timing,
  timeZone: string,
): Timing {
  const shift = daysBetween(startDate(before, timeZone), startDate(after, timeZone));
  return placeLike(after, addDays(startDate(series, timeZone), shift), timeZone);
}

/** Whole days between two timings' local start dates. */
export function dayShift(before: Timing, after: Timing, timeZone: string): number {
  return daysBetween(startDate(before, timeZone), startDate(after, timeZone));
}

/** Two timings are the same moment and length. */
export function sameTiming(a: Timing, b: Timing): boolean {
  return (
    a.all_day === b.all_day &&
    a.start_at === b.start_at &&
    a.end_at === b.end_at &&
    a.start_date === b.start_date &&
    a.end_date === b.end_date
  );
}
