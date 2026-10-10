/** Builders for calendar test data. */
import { singleOccurrence } from "./timing";
import type { CalendarEvent, EventItem, Occurrence } from "./types";

/** The zone every calendar test uses. */
export const TZ = "Europe/Amsterdam";

let counter = 0;

/** A one-hour timed event on Thu 8 Oct 2026, 09:00 Amsterdam; override what matters. */
export function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  counter += 1;
  return {
    id: `e${String(counter).padStart(3, "0")}`,
    title: `Event ${String(counter)}`,
    notes: "",
    location: "",
    all_day: false,
    start_at: "2026-10-08T07:00:00.000Z",
    end_at: "2026-10-08T08:00:00.000Z",
    start_date: null,
    end_date: null,
    rrule: null,
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

/** An all-day event from `start` to `end` (inclusive). */
export function makeAllDay(
  start: string,
  end: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return makeEvent({
    all_day: true,
    start_at: null,
    end_at: null,
    start_date: start,
    end_date: end,
    ...overrides,
  });
}

/** The display item of a single event, or of one given occurrence. */
export function itemOf(event: CalendarEvent, occurrence?: Occurrence): EventItem {
  const o = occurrence ?? singleOccurrence(event, TZ);
  return { kind: "event", key: `${event.id}:${o.occurrence_date}`, event, occurrence: o };
}
