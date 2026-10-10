/** Aliases of the generated backend types for the calendar module. */
import type { components } from "../../core/api/schema";
import type { CalendarFeedEntry } from "../../core/calendar/feed";
import type { IsoDate } from "../../core/time";

/** A timed or all-day event; with `rrule` a recurring series anchored at its start. */
export type CalendarEvent = components["schemas"]["EventOut"];

/** One appearance of an event; `occurrence_date` is its local start date. */
export type Occurrence = components["schemas"]["OccurrenceOut"];

/** The events in a date range and their occurrences there. */
export type CalendarRange = components["schemas"]["CalendarRangeOut"];

/** Body of POST /api/calendar/events. */
export type EventCreateVars = components["schemas"]["EventCreate"];

/** Body of PATCH /api/calendar/events/{id}. */
export type EventPatchVars = components["schemas"]["EventPatch"];

/** Which part of a series a change or delete applies to. */
export type Scope = NonNullable<EventPatchVars["scope"]>;

/** When an event or occurrence happens, in the API's form. */
export type Timing = Pick<Occurrence, "start_at" | "end_at" | "start_date" | "end_date"> & {
  all_day: boolean;
};

/** An event occurrence as the views show it. */
export interface EventItem {
  kind: "event";
  /** Stable per occurrence: `<event id>:<occurrence date>`. */
  key: string;
  event: CalendarEvent;
  occurrence: Occurrence;
}

/** Another module's dated item (e.g. a todo's due date). */
export interface EntryItem {
  kind: "entry";
  key: string;
  feedId: string;
  entry: CalendarFeedEntry;
}

/** Anything shown on a calendar day. */
export type CalendarItem = EventItem | EntryItem;

/** A view of the full-page calendar. */
export type CalendarView = "month" | "week" | "day";

/** The local days one occurrence covers and its minutes on each (for timed events). */
export interface DaySegment {
  item: EventItem;
  date: IsoDate;
  /** Minutes since local midnight, clipped to the day. */
  start: number;
  end: number;
}
