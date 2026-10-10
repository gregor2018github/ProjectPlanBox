/**
 * Pure selectors: merge the cached months, put items on days, and lay out
 * overlapping timed events side by side.
 */
import type { CalendarFeed } from "../../core/calendar/feed";
import { addDays, daysBetween, MINUTES_PER_DAY, zonedParts, type IsoDate } from "../../core/time";
import type {
  CalendarEvent,
  CalendarRange,
  DaySegment,
  EntryItem,
  EventItem,
  OccurrenceRange,
} from "./types";

/** The months (as "YYYY-MM") that `[from, to]` touches. */
export function monthsCovering(from: IsoDate, to: IsoDate): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${String(year)}-${String(month).padStart(2, "0")}`;
    months.push(key);
    if (key >= last) return months;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

/** The date range of a month key: `[first day, first day of the next month)`. */
export function monthRange(key: string): { start: IsoDate; end: IsoDate } {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const next =
    month === 12
      ? `${String(year + 1)}-01`
      : `${String(year)}-${String(month + 1).padStart(2, "0")}`;
  return { start: `${key}-01`, end: `${next}-01` };
}

/** Joins cached months into one list of event occurrences (deduplicated). */
export function mergeRanges(ranges: readonly CalendarRange[]): EventItem[] {
  const events = new Map<string, CalendarEvent>();
  for (const range of ranges) for (const event of range.events) events.set(event.id, event);
  const items = new Map<string, EventItem>();
  for (const range of ranges) {
    for (const occurrence of range.occurrences) {
      const event = events.get(occurrence.event_id);
      if (event === undefined) continue;
      const key = `${occurrence.event_id}:${occurrence.occurrence_date}`;
      items.set(key, { kind: "event", key, event, occurrence });
    }
  }
  return [...items.values()];
}

/** Every feed entry as a calendar item. */
export function entryItems(feeds: readonly CalendarFeed[]): EntryItem[] {
  return feeds.flatMap((feed) =>
    feed.entries.map((entry) => ({
      kind: "entry" as const,
      key:
        entry.projected === true
          ? `${feed.id}:${entry.ref}:${entry.date}`
          : `${feed.id}:${entry.ref}`,
      feedId: feed.id,
      entry,
    })),
  );
}

/** The local days an occurrence covers, each with its minutes on that day. */
export function segmentsOf(item: EventItem, timeZone: string): DaySegment[] {
  const o = item.occurrence;
  if (item.event.all_day) {
    const first = o.start_date ?? o.occurrence_date;
    const last = o.end_date ?? first;
    const range: OccurrenceRange = {
      startDate: first,
      start: 0,
      endDate: last,
      end: MINUTES_PER_DAY,
    };
    return Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => ({
      item,
      date: addDays(first, i),
      start: 0,
      end: MINUTES_PER_DAY,
      range,
    }));
  }
  const start = zonedParts(o.start_at ?? "", timeZone);
  let end = zonedParts(o.end_at ?? "", timeZone);
  // Ending exactly at midnight means ending at 24:00 the day before, not on the next day.
  if (end.minutes === 0 && end.date > start.date) {
    end = { date: addDays(end.date, -1), minutes: MINUTES_PER_DAY };
  }
  const range: OccurrenceRange = {
    startDate: start.date,
    start: start.minutes,
    endDate: end.date,
    end: end.minutes,
  };
  const days = daysBetween(start.date, end.date);
  return Array.from({ length: days + 1 }, (_, i) => ({
    item,
    date: addDays(start.date, i),
    start: i === 0 ? start.minutes : 0,
    end: i === days ? end.minutes : MINUTES_PER_DAY,
    range,
  }));
}

/** Whether a segment belongs to an occurrence that covers more than one day. */
export function isMultiDay(segment: DaySegment): boolean {
  return segment.range.startDate !== segment.range.endDate;
}

const MS_PER_DAY = MINUTES_PER_DAY * 60_000;

/**
 * Whether a multi-day occurrence belongs in the time grid's all-day row (as
 * one bar): all-day events and timed ones lasting at least 24 hours. Shorter
 * overnight events stay in the grid, split at midnight.
 */
export function barInTimeGrid(segment: DaySegment): boolean {
  const { event, occurrence } = segment.item;
  if (event.all_day) return true;
  return Date.parse(occurrence.end_at ?? "") - Date.parse(occurrence.start_at ?? "") >= MS_PER_DAY;
}

/** What one day shows, in display order. */
export interface DayItems {
  /** Days of occurrences that cover several days; views draw each as one item. */
  spanning: DaySegment[];
  /** Single-day all-day events and timed events lasting the whole day. */
  allDay: DaySegment[];
  timed: DaySegment[];
  entries: EntryItem[];
}

/** A day with nothing on it. */
export function emptyDay(): DayItems {
  return { spanning: [], allDay: [], timed: [], entries: [] };
}

/** How many items a day lists (events and feed entries). */
export function dayCount(day: DayItems): number {
  return day.spanning.length + day.allDay.length + day.timed.length + day.entries.length;
}

/** Earlier starts first, then longer occurrences, then by title. */
function compareSpans(a: DaySegment, b: DaySegment): number {
  return (
    a.range.startDate.localeCompare(b.range.startDate) ||
    b.range.endDate.localeCompare(a.range.endDate) ||
    a.item.event.title.localeCompare(b.item.event.title) ||
    a.item.key.localeCompare(b.item.key)
  );
}

/** Puts events and feed entries on the given days. */
export function itemsByDay(
  days: readonly IsoDate[],
  events: readonly EventItem[],
  entries: readonly EntryItem[],
  timeZone: string,
): Map<IsoDate, DayItems> {
  const result = new Map<IsoDate, DayItems>(days.map((d) => [d, emptyDay()]));
  for (const item of events) {
    for (const segment of segmentsOf(item, timeZone)) {
      const day = result.get(segment.date);
      if (day === undefined) continue;
      const whole = segment.start === 0 && segment.end === MINUTES_PER_DAY;
      if (isMultiDay(segment)) day.spanning.push(segment);
      else (item.event.all_day || whole ? day.allDay : day.timed).push(segment);
    }
  }
  for (const entry of entries) result.get(entry.entry.date)?.entries.push(entry);
  for (const day of result.values()) {
    day.spanning.sort(compareSpans);
    day.allDay.sort(
      (a, b) =>
        (a.item.occurrence.start_date ?? "").localeCompare(b.item.occurrence.start_date ?? "") ||
        a.item.event.title.localeCompare(b.item.event.title),
    );
    day.timed.sort(
      (a, b) => a.start - b.start || b.end - a.end || a.item.key.localeCompare(b.item.key),
    );
    day.entries.sort(
      (a, b) =>
        Number(a.entry.done) - Number(b.entry.done) ||
        Number(a.entry.projected === true) - Number(b.entry.projected === true) ||
        a.entry.title.localeCompare(b.entry.title),
    );
  }
  return result;
}

/** A timed segment placed in its day column: lane `lane` of `lanes` side by side. */
export interface PlacedSegment extends DaySegment {
  lane: number;
  lanes: number;
}

/** Very short events still get room to show their title. */
const MIN_LAYOUT_MINUTES = 20;

/**
 * Lays out a day's timed segments: overlapping ones share the width in
 * lanes; each cluster of overlaps uses as many lanes as it needs.
 */
export function layoutDay(segments: readonly DaySegment[]): PlacedSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: PlacedSegment[] = [];
  let cluster: PlacedSegment[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const segment of sorted) {
    if (segment.start >= clusterEnd) close();
    const end = Math.max(segment.end, segment.start + MIN_LAYOUT_MINUTES);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= segment.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    const p: PlacedSegment = { ...segment, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
  return placed;
}

/** A multi-day occurrence drawn as one bar across a row of consecutive days. */
export interface SpanBar {
  /** Its segment on the first day of the row it covers. */
  segment: DaySegment;
  /** Columns of its first and last day in the row (0-based, inclusive). */
  from: number;
  to: number;
  /** Its line within the row; bars on different lines never overlap. */
  lane: number;
  /** Whether it started before the row / goes on after it. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Lays out the multi-day occurrences of a row of days (a week) as bars,
 * each on the first lane that is free across all its days.
 */
export function layoutBars(
  row: readonly IsoDate[],
  byDay: ReadonlyMap<IsoDate, DayItems>,
  include: (segment: DaySegment) => boolean = () => true,
): { bars: SpanBar[]; lanes: number } {
  const spans = new Map<string, { segment: DaySegment; from: number; to: number }>();
  row.forEach((date, column) => {
    for (const segment of byDay.get(date)?.spanning ?? []) {
      if (!include(segment)) continue;
      const span = spans.get(segment.item.key);
      if (span === undefined) spans.set(segment.item.key, { segment, from: column, to: column });
      else span.to = column;
    }
  });
  const sorted = [...spans.values()].sort(
    (a, b) => a.from - b.from || b.to - a.to || compareSpans(a.segment, b.segment),
  );
  const laneEnds: number[] = [];
  const bars = sorted.map(({ segment, from, to }) => {
    let lane = laneEnds.findIndex((end) => end < from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = to;
    return {
      segment,
      from,
      to,
      lane,
      continuesBefore: segment.range.startDate < segment.date,
      continuesAfter: (row[to] ?? "") < segment.range.endDate,
    };
  });
  return { bars, lanes: laneEnds.length };
}

/**
 * The agenda's view of consecutive days: a multi-day occurrence is listed
 * once, on the first of `days` it touches.
 */
export function agendaDays(
  days: readonly IsoDate[],
  byDay: ReadonlyMap<IsoDate, DayItems>,
): Map<IsoDate, DayItems> {
  const listed = new Set<string>();
  const result = new Map<IsoDate, DayItems>();
  for (const date of days) {
    const day = byDay.get(date);
    if (day === undefined) continue;
    const spanning = day.spanning.filter((s) => !listed.has(s.item.key));
    for (const s of spanning) listed.add(s.item.key);
    result.set(date, { ...day, spanning });
  }
  return result;
}

/** `count` consecutive days from `first`. */
export function daysFrom(first: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}
