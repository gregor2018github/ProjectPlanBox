/**
 * What the user can do to events, in their words: each action asks which
 * events of a series it applies to (when it matters), applies the optimistic
 * mutation, and records how to undo it (toast for deletes, Ctrl+Z for all).
 */
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { useMeta } from "../../core/api/coreQueries";
import type { CalendarFeed } from "../../core/calendar/feed";
import { useCalendarFeeds } from "../../core/calendar/feedContext";
import { newId } from "../../core/ids";
import type { IsoDate } from "../../core/time";
import { useUndo } from "../../core/undo/undoContext";
import {
  applyAdd,
  applyDetach,
  applyRemoveFrom,
  applyRemoveOccurrence,
  applyReplace,
  applySplit,
  buildEvent,
} from "./apply";
import type { EventDraft } from "./draft";
import {
  useCreateEvent,
  useDeleteEvent,
  useRestoreEvent,
  useRestoreOccurrence,
  useUpdateEvent,
} from "./mutations";
import { shiftRule } from "../../core/recurrence/recurrence";
import {
  dayShift,
  occurrenceTiming,
  placeLike,
  sameTiming,
  seriesTimingFor,
  startDate,
  timingOf,
} from "./timing";
import type { CalendarEvent, EntryItem, EventItem, EventPatchVars, Scope, Timing } from "./types";
import { calendarUi } from "./uiStore";

/** Text fields an edit may change. */
export type TextChanges = Partial<Pick<CalendarEvent, "title" | "location" | "notes">>;

/** One edit of an occurrence: new text, new timing for it, and/or a new repeat rule. */
export interface EventChange {
  text?: TextChanges;
  /** The occurrence's new timing (not the series'). */
  timing?: Timing;
  /** A new rule for the series (null stops repeating); absent keeps it. */
  rrule?: string | null;
}

function timingBody(t: Timing) {
  return t.all_day
    ? { all_day: true, start_date: t.start_date, end_date: t.end_date }
    : { all_day: false, start_at: t.start_at, end_at: t.end_at };
}

/** "This and following" from the first occurrence is the whole series (the server agrees). */
function isFirst(item: EventItem, timeZone: string): boolean {
  return item.occurrence.occurrence_date <= startDate(item.event, timeZone);
}

function createBody(event: CalendarEvent) {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    ...timingBody(event),
    rrule: event.rrule,
  };
}

const now = () => new Date().toISOString();

/** Returns the calendar actions bound to the current caches. */
export function useCalendarActions() {
  const navigate = useNavigate();
  const pushUndo = useUndo();
  const feeds = useCalendarFeeds();
  const { data: meta } = useMeta();
  const timeZone = meta?.timezone ?? "UTC";
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const restoreEvent = useRestoreEvent();
  const restoreOccurrence = useRestoreOccurrence();

  return useMemo(() => {
    const feedOf = (entry: EntryItem): CalendarFeed | undefined =>
      feeds.find((f) => f.id === entry.feedId);

    /** Puts a whole event or series back the way it was. */
    const revert = (before: CalendarEvent, after: CalendarEvent) => {
      const { id: _id, ...body } = createBody(before);
      updateEvent.mutate({
        id: before.id,
        body,
        apply: (r) => applyReplace(r, after, before, timeZone),
      });
    };

    const changeAll = (item: EventItem, change: EventChange) => {
      const before = item.event;
      const occurrence = occurrenceTiming(before, item.occurrence);
      let timing = timingOf(before);
      let rrule = change.rrule === undefined ? before.rrule : change.rrule;
      if (change.timing && !sameTiming(change.timing, occurrence)) {
        timing =
          before.rrule === null
            ? change.timing
            : seriesTimingFor(timing, occurrence, change.timing, timeZone);
        const shift = dayShift(occurrence, change.timing, timeZone);
        if (change.rrule === undefined && before.rrule !== null) {
          rrule = shiftRule(before.rrule, shift);
        }
      }
      const after: CalendarEvent = {
        ...before,
        ...change.text,
        ...timing,
        rrule,
        updated_at: now(),
      };
      const body: EventPatchVars = {
        ...change.text,
        ...(!sameTiming(timing, timingOf(before)) && timingBody(timing)),
        ...(rrule !== before.rrule && { rrule }),
      };
      updateEvent.mutate({
        id: before.id,
        body,
        apply: (r) => applyReplace(r, before, after, timeZone),
      });
      pushUndo({
        label: `Changed “${before.title}”`,
        silent: true,
        undo: () => {
          revert(before, after);
        },
      });
    };

    const changePart = (item: EventItem, change: EventChange, scope: "this" | "following") => {
      const series = item.event;
      const date = item.occurrence.occurrence_date;
      const occurrence = occurrenceTiming(series, item.occurrence);
      const timing = change.timing ?? occurrence;
      const shift = dayShift(occurrence, timing, timeZone);
      const splitId = newId();
      let rrule: string | null = null;
      if (scope === "following") {
        if (change.rrule !== undefined) rrule = change.rrule;
        else if (series.rrule !== null) rrule = shiftRule(series.rrule, shift);
      }
      const split: CalendarEvent = {
        ...series,
        ...change.text,
        ...timing,
        id: splitId,
        rrule,
        created_at: now(),
        updated_at: now(),
      };
      const body: EventPatchVars = {
        scope,
        occurrence_date: date,
        split_id: splitId,
        ...change.text,
        ...(!sameTiming(timing, occurrence) && timingBody(timing)),
        ...(scope === "following" && rrule !== series.rrule && { rrule }),
      };
      updateEvent.mutate({
        id: series.id,
        body,
        apply: (r) =>
          scope === "this"
            ? applyDetach(r, series.id, date, split, timeZone)
            : applySplit(r, series.id, date, occurrence, split, timeZone),
      });
      pushUndo({
        label: `Changed “${series.title}”`,
        silent: true,
        undo: () => {
          deleteEvent.mutate({
            id: splitId,
            scope: "all",
            occurrenceDate: null,
            apply: (r) => applyRemoveFrom(r, splitId),
          });
          if (scope === "this") restoreOccurrence.mutate({ id: series.id, date });
          else updateEvent.mutate({ id: series.id, body: { rrule: series.rrule } });
        },
      });
    };

    /** Applies a change, asking "which events?" first for a series. */
    const change = async (item: EventItem, edit: EventChange): Promise<void> => {
      if (item.event.rrule === null) {
        changeAll(item, edit);
        return;
      }
      const scope = await calendarUi.askScope("change", edit.rrule === undefined);
      if (scope === null) return;
      if (scope === "all" || (scope === "following" && isFirst(item, timeZone))) {
        changeAll(item, edit);
      } else {
        changePart(item, edit, scope);
      }
    };

    const removeWith = (item: EventItem, scope: Scope) => {
      const event = item.event;
      const date = item.occurrence.occurrence_date;
      const single =
        event.rrule === null ||
        scope === "all" ||
        (scope === "following" && isFirst(item, timeZone));
      deleteEvent.mutate({
        id: event.id,
        scope: single ? "all" : scope,
        occurrenceDate: single ? null : date,
        apply: (r) =>
          single
            ? applyRemoveFrom(r, event.id)
            : scope === "this"
              ? applyRemoveOccurrence(r, event.id, date)
              : applyRemoveFrom(r, event.id, date),
      });
      pushUndo({
        label: `Deleted “${event.title}”`,
        undo: () => {
          if (single) restoreEvent.mutate({ id: event.id });
          else if (scope === "this") restoreOccurrence.mutate({ id: event.id, date });
          else updateEvent.mutate({ id: event.id, body: { rrule: event.rrule } });
        },
      });
    };

    return {
      timeZone,

      /** Creates an event; returns its id at once (optimistic). */
      create(timing: Timing, fields: TextChanges & { title: string }, rrule: string | null) {
        const id = newId();
        const event = buildEvent({ id, ...fields, ...timingBody(timing), rrule }, now());
        createEvent.mutate({
          body: createBody(event),
          apply: (r) => applyAdd(r, event, timeZone),
        });
        return id;
      },

      change,

      /** Moves an occurrence to another day, keeping its time and length. */
      moveToDate(item: EventItem, date: IsoDate): Promise<void> {
        const timing = occurrenceTiming(item.event, item.occurrence);
        if (item.occurrence.occurrence_date === date) return Promise.resolve();
        return change(item, { timing: placeLike(timing, date, timeZone) });
      },

      /** Deletes an occurrence, asking "which events?" first for a series. */
      async remove(item: EventItem): Promise<void> {
        if (item.event.rrule === null) {
          removeWith(item, "all");
          return;
        }
        const scope = await calendarUi.askScope("delete");
        if (scope !== null) removeWith(item, scope);
      },

      /** Opens the event dialog for an occurrence. */
      open(item: EventItem): void {
        calendarUi.openEditor({ mode: "edit", item });
      },

      /** Opens the event dialog for a new event. */
      openNew(draft: EventDraft): void {
        calendarUi.openEditor({ mode: "new", draft });
      },

      /** Opens another module's item in the detail panel. */
      openEntry(entry: EntryItem): void {
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, item: entry.entry.ref }),
        });
      },

      /** Moves another module's item to a date (the module records the undo). */
      rescheduleEntry(entry: EntryItem, date: IsoDate): void {
        if (entry.entry.date !== date) feedOf(entry)?.reschedule(entry.entry.ref, date);
      },

      /** Marks another module's item done or not done. */
      toggleEntry(entry: EntryItem): void {
        feedOf(entry)?.toggleDone(entry.entry.ref);
      },
    };
  }, [
    navigate,
    pushUndo,
    feeds,
    timeZone,
    createEvent,
    updateEvent,
    deleteEvent,
    restoreEvent,
    restoreOccurrence,
  ]);
}

/** The bound actions object. */
export type CalendarActions = ReturnType<typeof useCalendarActions>;
