/**
 * The event dialog's form state and its conversion to and from API timing.
 * Times are local to the configured zone; dates are floating.
 */
import {
  addDays,
  daysBetween,
  MINUTES_PER_DAY,
  zonedInstant,
  zonedParts,
  type IsoDate,
} from "../../core/time";
import { occurrenceTiming } from "./timing";
import type { EventItem, Timing } from "./types";

/** What the event dialog edits. */
export interface EventDraft {
  title: string;
  location: string;
  notes: string;
  allDay: boolean;
  startDate: IsoDate;
  /** For all-day events the last day (inclusive). */
  endDate: IsoDate;
  /** Minutes since local midnight (ignored for all-day events). */
  startMinutes: number;
  endMinutes: number;
  rrule: string | null;
}

/** A new event on `date`: timed from `start` to `end` minutes, or all-day without times. */
export function newDraft(
  date: IsoDate,
  times: { start: number; end: number } | null = null,
): EventDraft {
  const start = times?.start ?? 9 * 60;
  const end = times?.end ?? start + 60;
  return {
    title: "",
    location: "",
    notes: "",
    allDay: times === null,
    startDate: date,
    endDate: end >= MINUTES_PER_DAY && times !== null ? addDays(date, 1) : date,
    startMinutes: start,
    endMinutes: end % MINUTES_PER_DAY,
    rrule: null,
  };
}

/** A timed draft for a fresh "New event": the next full hour today, or 09:00 on another day. */
export function newTimedDraft(date: IsoDate, now: { date: IsoDate; minutes: number }): EventDraft {
  const start =
    date === now.date ? Math.min(Math.ceil((now.minutes + 1) / 60) * 60, 23 * 60) : 9 * 60;
  return newDraft(date, { start, end: start + 60 });
}

/** The draft for editing one occurrence (its own times, the series' rule). */
export function draftFromItem(item: EventItem, timeZone: string): EventDraft {
  const t = occurrenceTiming(item.event, item.occurrence);
  const base = {
    title: item.event.title,
    location: item.event.location,
    notes: item.event.notes,
    rrule: item.event.rrule,
  };
  if (t.all_day) {
    const start = t.start_date ?? item.occurrence.occurrence_date;
    return {
      ...base,
      allDay: true,
      startDate: start,
      endDate: t.end_date ?? start,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
    };
  }
  const start = zonedParts(t.start_at ?? "", timeZone);
  const end = zonedParts(t.end_at ?? "", timeZone);
  return {
    ...base,
    allDay: false,
    startDate: start.date,
    endDate: end.date,
    startMinutes: start.minutes,
    endMinutes: end.minutes,
  };
}

/** The draft's timing, or a sentence explaining why it is not valid. */
export function draftTiming(draft: EventDraft, timeZone: string): Timing | string {
  if (draft.allDay) {
    if (draft.endDate < draft.startDate) return "The event cannot end before it starts.";
    return {
      all_day: true,
      start_at: null,
      end_at: null,
      start_date: draft.startDate,
      end_date: draft.endDate,
    };
  }
  const start = zonedInstant(draft.startDate, draft.startMinutes, timeZone);
  const end = zonedInstant(draft.endDate, draft.endMinutes, timeZone);
  if (Date.parse(end) <= Date.parse(start)) return "The event must end after it starts.";
  return { all_day: false, start_at: start, end_at: end, start_date: null, end_date: null };
}

/** The text fields that differ between two drafts (for a minimal patch). */
export function changedText(
  before: EventDraft,
  after: EventDraft,
): Partial<Pick<EventDraft, "title" | "location" | "notes">> {
  return {
    ...(before.title !== after.title && { title: after.title }),
    ...(before.location !== after.location && { location: after.location }),
    ...(before.notes !== after.notes && { notes: after.notes }),
  };
}

/**
 * Moves the start and keeps the duration, as calendars do: changing the
 * start date or time drags the end along.
 */
export function withStart(draft: EventDraft, date: IsoDate, minutes: number): EventDraft {
  const length =
    daysBetween(draft.startDate, draft.endDate) * MINUTES_PER_DAY +
    draft.endMinutes -
    draft.startMinutes;
  const endTotal = minutes + length;
  const endDays = Math.floor(endTotal / MINUTES_PER_DAY);
  return {
    ...draft,
    startDate: date,
    startMinutes: minutes,
    endDate: addDays(date, endDays),
    endMinutes: endTotal - endDays * MINUTES_PER_DAY,
  };
}
