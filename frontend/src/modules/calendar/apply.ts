/**
 * Optimistic patches for a cached month (ARCHITECTURE §8). Each mutation
 * applies one of these to every cached month at once; afterwards the months
 * are refetched, because only the server expands recurrence exactly.
 */
import type { IsoDate } from "../../core/time";
import { retime, singleOccurrence } from "./timing";
import type { CalendarEvent, CalendarRange, EventCreateVars, Timing } from "./types";

/** Builds the row a create will produce. */
export function buildEvent(vars: EventCreateVars & { id: string }, now: string): CalendarEvent {
  return {
    id: vars.id,
    title: vars.title.trim(),
    notes: vars.notes ?? "",
    location: vars.location ?? "",
    all_day: vars.all_day ?? false,
    start_at: vars.start_at ?? null,
    end_at: vars.end_at ?? null,
    start_date: vars.start_date ?? null,
    end_date: vars.end_date ?? null,
    rrule: vars.rrule ?? null,
    created_at: now,
    updated_at: now,
  };
}

/** Adds an event and its first occurrence. */
export function applyAdd(
  range: CalendarRange,
  event: CalendarEvent,
  timeZone: string,
): CalendarRange {
  return {
    events: [...range.events.filter((e) => e.id !== event.id), event],
    occurrences: [...range.occurrences, singleOccurrence(event, timeZone)],
  };
}

/** Replaces a whole event or series; its occurrences move the way its start moved. */
export function applyReplace(
  range: CalendarRange,
  before: CalendarEvent,
  after: CalendarEvent,
  timeZone: string,
): CalendarRange {
  if (!range.events.some((e) => e.id === before.id)) return range;
  return {
    events: range.events.map((e) => (e.id === before.id ? after : e)),
    occurrences: range.occurrences.map((o) =>
      o.event_id === before.id ? retime(o, before, after, timeZone) : o,
    ),
  };
}

/** Removes one occurrence of a series (a "this" delete, or the first half of a detach). */
export function applyRemoveOccurrence(
  range: CalendarRange,
  eventId: string,
  date: IsoDate,
): CalendarRange {
  return {
    events: range.events,
    occurrences: range.occurrences.filter(
      (o) => !(o.event_id === eventId && o.occurrence_date === date),
    ),
  };
}

/** Removes an event's occurrences from `date` on (all of them without a date). */
export function applyRemoveFrom(
  range: CalendarRange,
  eventId: string,
  date: IsoDate | null = null,
): CalendarRange {
  const occurrences = range.occurrences.filter(
    (o) => !(o.event_id === eventId && (date === null || o.occurrence_date >= date)),
  );
  return {
    events: range.events.filter(
      (e) => e.id !== eventId || occurrences.some((o) => o.event_id === eventId),
    ),
    occurrences,
  };
}

/** One occurrence becomes its own single event. */
export function applyDetach(
  range: CalendarRange,
  seriesId: string,
  date: IsoDate,
  detached: CalendarEvent,
  timeZone: string,
): CalendarRange {
  return applyAdd(applyRemoveOccurrence(range, seriesId, date), detached, timeZone);
}

/**
 * A series continues as `tail` from `date`: those occurrences move to the
 * tail, shifted the way the occurrence at `date` (timing `before`) was.
 */
export function applySplit(
  range: CalendarRange,
  seriesId: string,
  date: IsoDate,
  before: Timing,
  tail: CalendarEvent,
  timeZone: string,
): CalendarRange {
  const moved = range.occurrences.filter(
    (o) => o.event_id === seriesId && o.occurrence_date >= date,
  );
  const rest = applyRemoveFrom(range, seriesId, date);
  const kept = tail.rrule === null ? moved.slice(0, 1) : moved;
  return {
    events: [...rest.events, tail],
    occurrences: [...rest.occurrences, ...kept.map((o) => retime(o, before, tail, timeZone))],
  };
}
