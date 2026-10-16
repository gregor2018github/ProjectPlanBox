/**
 * The calendar module on the device: the twin of
 * `backend/planbox/modules/calendar/` (ARCHITECTURE: Calendar module).
 *
 * A recurring event is one row whose RRULE expands on read. Changing or
 * deleting part of a series takes a scope: `all` (the row), `this` (an
 * exception plus, for a change, a detached event) or `following` (the
 * series is cut and, for a change, a new one starts). Occurrences are
 * keyed by their local start date; done marks follow them.
 */
import { newId } from "../../../core/ids";
import { nowIso, type Clock } from "../../../core/device/clock";
import { changesOf, checkClientId, oneLine } from "../../../core/device/common";
import {
  chunks,
  int,
  marks,
  text,
  textOrNull,
  type Database,
  type Row,
  type Value,
} from "../../../core/device/db";
import { lifecycleEvents, type ActivityEvent } from "../../../core/device/entities";
import { NotFound, textLength, ValidationFailed } from "../../../core/device/errors";
import * as recurrence from "../../../core/device/recurrence";
import {
  Answer,
  type DeviceContext,
  type DeviceModule,
  type Handlers,
} from "../../../core/device/server";
import {
  dateDay,
  DAY_MS,
  instantMs,
  isoDate,
  localDay,
  midnight,
  parseInstant,
  toIso,
  type Day,
} from "../../../core/device/time";

const ENTITY_TYPE = "calendar.event";
const MAX_TITLE = 500;
const MAX_LOCATION = 500;
const MAX_NOTES = 20_000;
const MAX_RANGE_DAYS = 100;
const MAX_SPAN_DAYS = 366;
const TIMING_KEYS = new Set(["all_day", "start_at", "end_at", "start_date", "end_date"]);

type Scope = "all" | "this" | "following";

interface Event {
  id: string;
  title: string;
  notes: string;
  location: string;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  rrule: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface DoneMark {
  id: string;
  event_id: string;
  occurrence_date: string;
  done: boolean;
  updated_at: string;
}

interface Occurrence {
  event_id: string;
  occurrence_date: string;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  marked_done: boolean | null;
}

interface Timing {
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDate: string | null;
}

const EVENT =
  "id, title, notes, location, all_day, start_at, end_at, start_date, end_date, rrule, created_at, updated_at, deleted_at";
const MARK = "id, event_id, occurrence_date, done, updated_at";
const EVENT_EDITABLE = new Set([
  "title",
  "notes",
  "location",
  "all_day",
  "start_at",
  "end_at",
  "start_date",
  "end_date",
  "rrule",
]);

function eventOf(r: Row): Event {
  return {
    id: text(r, "id"),
    title: text(r, "title"),
    notes: text(r, "notes"),
    location: text(r, "location"),
    all_day: int(r, "all_day") === 1,
    start_at: textOrNull(r, "start_at"),
    end_at: textOrNull(r, "end_at"),
    start_date: textOrNull(r, "start_date"),
    end_date: textOrNull(r, "end_date"),
    rrule: textOrNull(r, "rrule"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

function markOf(r: Row): DoneMark {
  return {
    id: text(r, "id"),
    event_id: text(r, "event_id"),
    occurrence_date: text(r, "occurrence_date"),
    done: int(r, "done") === 1,
    updated_at: text(r, "updated_at"),
  };
}

// ---------------------------------------------------------------- repository

class Repositories {
  constructor(private readonly db: Database) {}

  getEvent(id: string): Event | null {
    const row = this.db.get(`SELECT ${EVENT} FROM calendar_events WHERE id = ?`, [id]);
    return row === undefined ? null : eventOf(row);
  }

  singlesInRange(startAt: string, endAt: string, startDate: string, endDate: string): Event[] {
    return this.db
      .all(
        `SELECT ${EVENT} FROM calendar_events WHERE deleted_at IS NULL AND rrule IS NULL AND (` +
          "(all_day = 0 AND start_at < :end_at AND end_at > :start_at) OR " +
          "(all_day = 1 AND start_date < :end_date AND end_date >= :start_date)" +
          ") ORDER BY all_day DESC, start_date, start_at, id",
        { start_at: startAt, end_at: endAt, start_date: startDate, end_date: endDate },
      )
      .map(eventOf);
  }

  recurringBefore(endAt: string, endDate: string): Event[] {
    return this.db
      .all(
        `SELECT ${EVENT} FROM calendar_events WHERE deleted_at IS NULL AND rrule IS NOT NULL AND (` +
          "(all_day = 0 AND start_at < :end_at) OR (all_day = 1 AND start_date < :end_date)) ORDER BY id",
        { end_at: endAt, end_date: endDate },
      )
      .map(eventOf);
  }

  insertEvent(e: Event): void {
    this.db.run(
      `INSERT INTO calendar_events (${EVENT}) VALUES (:id, :title, :notes, :location, :all_day, :start_at, ` +
        ":end_at, :start_date, :end_date, :rrule, :created_at, :updated_at, :deleted_at)",
      { ...e, all_day: e.all_day ? 1 : 0 },
    );
  }

  updateEvent(id: string, fields: Record<string, Value | boolean>, now: string): void {
    const names = Object.keys(fields);
    if (names.some((n) => !EVENT_EDITABLE.has(n)))
      throw new Error("cannot update that on calendar_events");
    if (names.length === 0) return;
    const values: Record<string, Value> = {};
    for (const [k, v] of Object.entries(fields))
      values[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
    this.db.run(
      `UPDATE calendar_events SET ${names.map((n) => `${n} = :${n}`).join(", ")}, updated_at = :updated_at WHERE id = :id`,
      { ...values, updated_at: now, id },
    );
  }

  setEventDeleted(id: string, deletedAt: string | null, now: string): void {
    this.db.run("UPDATE calendar_events SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      deletedAt,
      now,
      id,
    ]);
  }

  liveExceptions(
    eventIds: readonly string[],
  ): { id: string; event_id: string; occurrence_date: string }[] {
    const result = [];
    for (const chunk of chunks(eventIds)) {
      for (const r of this.db.all(
        "SELECT id, event_id, occurrence_date FROM calendar_exceptions " +
          `WHERE deleted_at IS NULL AND event_id IN (${marks(chunk)}) ORDER BY event_id, occurrence_date`,
        chunk,
      )) {
        result.push({
          id: text(r, "id"),
          event_id: text(r, "event_id"),
          occurrence_date: text(r, "occurrence_date"),
        });
      }
    }
    return result;
  }

  liveException(eventId: string, day: string): string | null {
    const row = this.db.get(
      "SELECT id FROM calendar_exceptions WHERE deleted_at IS NULL AND event_id = ? AND occurrence_date = ?",
      [eventId, day],
    );
    return row === undefined ? null : text(row, "id");
  }

  insertException(eventId: string, day: string, now: string): void {
    this.db.run(
      "INSERT INTO calendar_exceptions (id, event_id, occurrence_date, created_at, updated_at, deleted_at) " +
        "VALUES (?, ?, ?, ?, ?, NULL)",
      [newId(), eventId, day, now, now],
    );
  }

  moveException(id: string, eventId: string, day: string, now: string): void {
    this.db.run(
      "UPDATE calendar_exceptions SET event_id = ?, occurrence_date = ?, updated_at = ? WHERE id = ?",
      [eventId, day, now, id],
    );
  }

  setExceptionDeleted(id: string, deletedAt: string, now: string): void {
    this.db.run("UPDATE calendar_exceptions SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      deletedAt,
      now,
      id,
    ]);
  }

  liveMarks(eventIds: readonly string[]): DoneMark[] {
    const result: DoneMark[] = [];
    for (const chunk of chunks(eventIds)) {
      result.push(
        ...this.db
          .all(
            `SELECT ${MARK} FROM calendar_done_marks WHERE deleted_at IS NULL AND event_id IN (${marks(chunk)}) ` +
              "ORDER BY event_id, occurrence_date",
            chunk,
          )
          .map(markOf),
      );
    }
    return result;
  }

  liveMark(eventId: string, day: string): DoneMark | null {
    const row = this.db.get(
      `SELECT ${MARK} FROM calendar_done_marks WHERE deleted_at IS NULL AND event_id = ? AND occurrence_date = ?`,
      [eventId, day],
    );
    return row === undefined ? null : markOf(row);
  }

  insertMark(eventId: string, day: string, done: boolean, now: string): void {
    this.db.run(
      "INSERT INTO calendar_done_marks (id, event_id, occurrence_date, done, created_at, updated_at, deleted_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, NULL)",
      [newId(), eventId, day, done ? 1 : 0, now, now],
    );
  }

  marksSince(since: string): DoneMark[] {
    return this.db
      .all(
        "SELECT m.id, m.event_id, m.occurrence_date, m.done, m.updated_at " +
          "FROM calendar_done_marks m JOIN calendar_events e ON e.id = m.event_id " +
          "WHERE m.deleted_at IS NULL AND e.deleted_at IS NULL AND m.updated_at >= ?",
        [since],
      )
      .map(markOf);
  }

  setMarkDone(id: string, done: boolean, now: string): void {
    this.db.run("UPDATE calendar_done_marks SET done = ?, updated_at = ? WHERE id = ?", [
      done ? 1 : 0,
      now,
      id,
    ]);
  }

  moveMark(id: string, eventId: string, day: string, now: string): void {
    this.db.run(
      "UPDATE calendar_done_marks SET event_id = ?, occurrence_date = ?, updated_at = ? WHERE id = ?",
      [eventId, day, now, id],
    );
  }

  setMarkDeleted(id: string, deletedAt: string, now: string): void {
    this.db.run("UPDATE calendar_done_marks SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      deletedAt,
      now,
      id,
    ]);
  }
}

// ---------------------------------------------------------------- helpers

function cleanTitle(title: string): string {
  const cleaned = oneLine(title);
  if (!cleaned) throw new ValidationFailed("An event needs a title.");
  if (textLength(cleaned) > MAX_TITLE)
    throw new ValidationFailed(`Titles are at most ${String(MAX_TITLE)} characters.`);
  return cleaned;
}

function cleanLocation(location: string): string {
  const cleaned = oneLine(location);
  if (textLength(cleaned) > MAX_LOCATION) {
    throw new ValidationFailed(`Locations are at most ${String(MAX_LOCATION)} characters.`);
  }
  return cleaned;
}

function cleanNotes(notes: string): string {
  if (textLength(notes) > MAX_NOTES)
    throw new ValidationFailed(`Notes are at most ${String(MAX_NOTES)} characters.`);
  return notes;
}

/** Stores an aware date-time as a UTC instant. */
function instant(value: string): string {
  const parsed = parseInstant(value);
  if (!parsed?.aware) throw new ValidationFailed("Times need a timezone (use UTC, e.g. ...Z).");
  return toIso(parsed.ms);
}

function checkTiming(timing: Timing): Timing {
  if (timing.allDay) {
    if (timing.startDate === null || timing.endDate === null) {
      throw new ValidationFailed("An all-day event needs a start and an end date.");
    }
    const span = dateDay(timing.endDate) - dateDay(timing.startDate);
    if (span < 0) throw new ValidationFailed("An event cannot end before it starts.");
    if (span >= MAX_SPAN_DAYS)
      throw new ValidationFailed(`Events last at most ${String(MAX_SPAN_DAYS)} days.`);
    return {
      allDay: true,
      startAt: null,
      endAt: null,
      startDate: timing.startDate,
      endDate: timing.endDate,
    };
  }
  if (timing.startAt === null || timing.endAt === null) {
    throw new ValidationFailed("A timed event needs a start and an end time.");
  }
  const duration = instantMs(timing.endAt) - instantMs(timing.startAt);
  if (duration <= 0) throw new ValidationFailed("An event must end after it starts.");
  if (duration > MAX_SPAN_DAYS * DAY_MS)
    throw new ValidationFailed(`Events last at most ${String(MAX_SPAN_DAYS)} days.`);
  return {
    allDay: false,
    startAt: timing.startAt,
    endAt: timing.endAt,
    startDate: null,
    endDate: null,
  };
}

function mergeTiming(base: Timing, changes: ReadonlyMap<string, unknown>): Timing {
  const allDay = changes.has("all_day") ? changes.get("all_day") : base.allDay;
  if (typeof allDay !== "boolean") throw new ValidationFailed("all_day must be true or false.");
  const sameKind = allDay === base.allDay;
  const pick = (key: string, current: string | null): string | null => {
    const value = changes.has(key) ? changes.get(key) : sameKind ? current : null;
    return typeof value === "string" ? value : null;
  };
  if (allDay) {
    return checkTiming({
      allDay: true,
      startAt: null,
      endAt: null,
      startDate: pick("start_date", base.startDate),
      endDate: pick("end_date", base.endDate),
    });
  }
  return checkTiming({
    allDay: false,
    startAt: pick("start_at", base.startAt),
    endAt: pick("end_at", base.endAt),
    startDate: null,
    endDate: null,
  });
}

function timingOf(e: Event): Timing {
  return {
    allDay: e.all_day,
    startAt: e.start_at,
    endAt: e.end_at,
    startDate: e.start_date,
    endDate: e.end_date,
  };
}

function live(event: Event | null): Event {
  if (event?.deleted_at !== null) throw new NotFound("No event with this id.");
  return event;
}

// ---------------------------------------------------------------- service

class EventService {
  private readonly repos: Repositories;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly zone: string,
  ) {
    this.repos = new Repositories(db);
  }

  private anchor(t: Timing): recurrence.Anchor {
    if (t.allDay)
      return recurrence.allDayAnchor(dateDay(t.startDate ?? ""), dateDay(t.endDate ?? ""));
    return recurrence.timedAnchor(instantMs(t.startAt ?? ""), instantMs(t.endAt ?? ""), this.zone);
  }

  private localDate(t: Timing): Day {
    return t.allDay ? dateDay(t.startDate ?? "") : localDay(instantMs(t.startAt ?? ""), this.zone);
  }

  private spanTiming(span: recurrence.Span, allDay: boolean): Timing {
    if (allDay) {
      return {
        allDay: true,
        startAt: null,
        endAt: null,
        startDate: isoDate(Math.floor(span.start / DAY_MS)),
        endDate: isoDate(Math.floor((span.end - DAY_MS) / DAY_MS)),
      };
    }
    return {
      allDay: false,
      startAt: toIso(span.start),
      endAt: toIso(span.end),
      startDate: null,
      endDate: null,
    };
  }

  private normalizeRule(rule: string | null, timing: Timing): string | null {
    if (!rule?.trim()) return null;
    try {
      return recurrence.normalize(rule, this.anchor(timing), this.zone);
    } catch (error) {
      if (error instanceof recurrence.RecurrenceError) throw new ValidationFailed(error.message);
      throw error;
    }
  }

  private occurrence(event: Event, day: Day | null): Timing {
    if (day === null) {
      throw new ValidationFailed(
        "Name the occurrence (occurrence_date) to change only part of a series.",
      );
    }
    const span = recurrence.occurrenceOn(
      event.rrule ?? "",
      this.anchor(timingOf(event)),
      day,
      this.zone,
    );
    if (span === null || this.repos.liveException(event.id, isoDate(day)) !== null) {
      throw new NotFound("This event does not happen on that date.");
    }
    return this.spanTiming(span, event.all_day);
  }

  private isFirst(event: Event, day: Day): boolean {
    return recurrence.countBefore(event.rrule ?? "", this.anchor(timingOf(event)), day) === 0;
  }

  get(id: string): Event {
    return live(this.repos.getEvent(id));
  }

  inRange(start: Day, end: Day): { events: Event[]; occurrences: Occurrence[] } {
    const days = end - start;
    if (days <= 0) throw new ValidationFailed("The range must end after it starts.");
    if (days > MAX_RANGE_DAYS)
      throw new ValidationFailed(`Ask for at most ${String(MAX_RANGE_DAYS)} days at a time.`);
    return this.expand(start, end);
  }

  private expand(start: Day, end: Day): { events: Event[]; occurrences: Occurrence[] } {
    const startUtc = midnight(start, this.zone);
    const endUtc = midnight(end, this.zone);
    const singles = this.repos.singlesInRange(
      toIso(startUtc),
      toIso(endUtc),
      isoDate(start),
      isoDate(end),
    );
    const series = this.repos.recurringBefore(toIso(endUtc), isoDate(end));
    const skipped = new Map<string, Set<Day>>();
    for (const exc of this.repos.liveExceptions(series.map((e) => e.id))) {
      const set = skipped.get(exc.event_id) ?? new Set<Day>();
      set.add(dateDay(exc.occurrence_date));
      skipped.set(exc.event_id, set);
    }
    const events = [...singles];
    let occurrences = singles.map((e) => this.singleOccurrence(e));
    for (const event of series) {
      const [lo, hi] = event.all_day ? [start * DAY_MS, end * DAY_MS] : [startUtc, endUtc];
      const spans = recurrence.between(
        event.rrule ?? "",
        this.anchor(timingOf(event)),
        lo,
        hi,
        skipped.get(event.id),
      );
      if (spans.length > 0) {
        events.push(event);
        occurrences.push(...spans.map((s) => this.seriesOccurrence(event, s)));
      }
    }
    const markMap = new Map(
      this.repos
        .liveMarks(events.map((e) => e.id))
        .map((m) => [`${m.event_id}|${m.occurrence_date}`, m]),
    );
    occurrences = occurrences.map((o) => {
      const mark = markMap.get(`${o.event_id}|${o.occurrence_date}`);
      return mark === undefined ? o : { ...o, marked_done: mark.done };
    });
    occurrences.sort((a, b) => {
      const ka = a.start_date ?? a.start_at ?? "";
      const kb = b.start_date ?? b.start_at ?? "";
      return ka < kb
        ? -1
        : ka > kb
          ? 1
          : a.event_id < b.event_id
            ? -1
            : a.event_id > b.event_id
              ? 1
              : 0;
    });
    return { events, occurrences };
  }

  /** When occurrences got done (ticked by hand, or ended without a mark). */
  completions(since: string, now: string): string[] {
    const first = localDay(instantMs(since), this.zone) - MAX_SPAN_DAYS;
    const last = localDay(instantMs(now), this.zone) + 1;
    const found: string[] = [];
    for (const occurrence of this.expand(first, last).occurrences) {
      if (occurrence.marked_done === null) {
        const ended =
          occurrence.end_at ?? toIso(midnight(dateDay(occurrence.end_date ?? "") + 1, this.zone));
        if (since <= ended && ended <= now) found.push(ended);
      }
    }
    for (const mark of this.repos.marksSince(since)) if (mark.done) found.push(mark.updated_at);
    return found;
  }

  private singleOccurrence(event: Event): Occurrence {
    const t = timingOf(event);
    return {
      event_id: event.id,
      occurrence_date: isoDate(this.localDate(t)),
      start_at: t.startAt,
      end_at: t.endAt,
      start_date: t.startDate,
      end_date: t.endDate,
      marked_done: null,
    };
  }

  private seriesOccurrence(event: Event, span: recurrence.Span): Occurrence {
    const t = this.spanTiming(span, event.all_day);
    return {
      event_id: event.id,
      occurrence_date: isoDate(span.occurrenceDate),
      start_at: t.startAt,
      end_at: t.endAt,
      start_date: t.startDate,
      end_date: t.endDate,
      marked_done: null,
    };
  }

  create(input: {
    id: string | null;
    title: string;
    notes: string;
    location: string;
    timing: Timing;
    rrule: string | null;
  }): [Event, boolean] {
    checkClientId(input.id);
    const title = cleanTitle(input.title);
    const notes = cleanNotes(input.notes);
    const location = cleanLocation(input.location);
    const timing = checkTiming(input.timing);
    const rule = this.normalizeRule(input.rrule, timing);
    return this.db.transaction(() => {
      if (input.id !== null) {
        const existing = this.repos.getEvent(input.id);
        if (existing !== null) return [existing, false];
      }
      return [this.insert(input.id, [title, notes, location], timing, rule), true];
    });
  }

  private insert(
    id: string | null,
    textParts: [string, string, string],
    timing: Timing,
    rule: string | null,
  ): Event {
    const [title, notes, location] = textParts;
    const now = nowIso(this.clock);
    const event: Event = {
      id: id ?? newId(),
      title,
      notes,
      location,
      all_day: timing.allDay,
      start_at: timing.startAt,
      end_at: timing.endAt,
      start_date: timing.startDate,
      end_date: timing.endDate,
      rrule: rule,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    this.repos.insertEvent(event);
    return event;
  }

  update(
    id: string,
    changes: ReadonlyMap<string, unknown>,
    scope: Scope,
    occurrenceDate: Day | null,
    splitId: string | null,
  ): Event[] {
    checkClientId(splitId);
    const fields = this.cleanChanges(changes);
    return this.db.transaction(() => {
      const event = live(this.repos.getEvent(id));
      if (event.rrule === null || scope === "all") return [this.updateAll(event, fields)];
      if (splitId !== null) {
        const existing = this.repos.getEvent(splitId);
        if (existing !== null) return [event, existing];
      }
      const occurrence = this.occurrence(event, occurrenceDate);
      const day = occurrenceDate as Day;
      if (scope === "following" && this.isFirst(event, day)) return [this.updateAll(event, fields)];
      if (scope === "this") return this.detach(event, occurrence, day, fields, splitId);
      return this.split(event, occurrence, day, fields, splitId);
    });
  }

  private cleanChanges(changes: ReadonlyMap<string, unknown>): Map<string, unknown> {
    const fields = new Map<string, unknown>();
    for (const [key, value] of changes) {
      if (key === "title" && typeof value === "string") fields.set(key, cleanTitle(value));
      else if (key === "notes" && typeof value === "string") fields.set(key, cleanNotes(value));
      else if (key === "location" && typeof value === "string")
        fields.set(key, cleanLocation(value));
      else if (key === "all_day" && typeof value === "boolean") fields.set(key, value);
      else if (
        (key === "start_at" || key === "end_at") &&
        (value === null || typeof value === "string")
      ) {
        fields.set(key, value === null ? null : instant(value));
      } else if (
        (key === "start_date" || key === "end_date") &&
        (value === null || typeof value === "string")
      ) {
        fields.set(key, value);
      } else if (key === "rrule" && (value === null || typeof value === "string"))
        fields.set(key, value);
      else throw new ValidationFailed(`Cannot change '${key}' like that.`);
    }
    return fields;
  }

  private updateAll(event: Event, fields: ReadonlyMap<string, unknown>): Event {
    const timing = mergeTiming(timingOf(event), fields);
    const ruleIn = fields.has("rrule") ? fields.get("rrule") : event.rrule;
    const rule = this.normalizeRule(typeof ruleIn === "string" ? ruleIn : null, timing);
    const now = nowIso(this.clock);
    const update: Record<string, Value | boolean> = {};
    for (const [k, v] of fields) if (!TIMING_KEYS.has(k) && k !== "rrule") update[k] = v as Value;
    Object.assign(update, {
      all_day: timing.allDay,
      start_at: timing.startAt,
      end_at: timing.endAt,
      start_date: timing.startDate,
      end_date: timing.endDate,
      rrule: rule,
    });
    this.repos.updateEvent(event.id, update, now);
    const shift = this.localDate(timing) - this.localDate(timingOf(event));
    if (event.rrule !== null && rule !== null && shift !== 0) {
      for (const exc of this.repos.liveExceptions([event.id])) {
        this.repos.moveException(
          exc.id,
          event.id,
          isoDate(dateDay(exc.occurrence_date) + shift),
          now,
        );
      }
    }
    if (shift !== 0) this.moveMarks(event.id, event.id, shift, now, null);
    return live(this.repos.getEvent(event.id));
  }

  private moveMarks(
    eventId: string,
    toEventId: string,
    shift: number,
    now: string,
    fromDay: Day | null,
  ): void {
    for (const mark of this.repos.liveMarks([eventId])) {
      const day = dateDay(mark.occurrence_date);
      if (fromDay === null || day >= fromDay)
        this.repos.moveMark(mark.id, toEventId, isoDate(day + shift), now);
    }
  }

  private mergedText(event: Event, fields: ReadonlyMap<string, unknown>): [string, string, string] {
    const t = fields.get("title");
    const n = fields.get("notes");
    const l = fields.get("location");
    return [
      typeof t === "string" ? t : event.title,
      typeof n === "string" ? n : event.notes,
      typeof l === "string" ? l : event.location,
    ];
  }

  private detach(
    event: Event,
    occurrence: Timing,
    day: Day,
    fields: ReadonlyMap<string, unknown>,
    splitId: string | null,
  ): Event[] {
    if ((fields.get("rrule") ?? null) !== null) {
      throw new ValidationFailed(
        "A repeat rule belongs to a series; change all or following events.",
      );
    }
    const timing = mergeTiming(occurrence, fields);
    this.repos.insertException(event.id, isoDate(day), nowIso(this.clock));
    const detached = this.insert(splitId, this.mergedText(event, fields), timing, null);
    const mark = this.repos.liveMark(event.id, isoDate(day));
    if (mark !== null) {
      this.repos.moveMark(
        mark.id,
        detached.id,
        isoDate(this.localDate(timing)),
        nowIso(this.clock),
      );
    }
    return [live(this.repos.getEvent(event.id)), detached];
  }

  private split(
    event: Event,
    occurrence: Timing,
    day: Day,
    fields: ReadonlyMap<string, unknown>,
    splitId: string | null,
  ): Event[] {
    const rule = event.rrule ?? "";
    const anchor = this.anchor(timingOf(event));
    const now = nowIso(this.clock);
    this.repos.updateEvent(
      event.id,
      { rrule: recurrence.endBefore(rule, anchor, day, this.zone) },
      now,
    );
    const timing = mergeTiming(occurrence, fields);
    let tailRule: string | null;
    if (fields.has("rrule")) {
      const tailIn = fields.get("rrule");
      tailRule = this.normalizeRule(typeof tailIn === "string" ? tailIn : null, timing);
    } else {
      tailRule = this.normalizeRule(recurrence.remaining(rule, anchor, day), timing);
    }
    const tail = this.insert(splitId, this.mergedText(event, fields), timing, tailRule);
    const shift = this.localDate(timing) - day;
    if (tailRule !== null) {
      for (const exc of this.repos.liveExceptions([event.id])) {
        const excDay = dateDay(exc.occurrence_date);
        if (excDay >= day) this.repos.moveException(exc.id, tail.id, isoDate(excDay + shift), now);
      }
    }
    this.moveMarks(event.id, tail.id, shift, now, day);
    return [live(this.repos.getEvent(event.id)), tail];
  }

  delete(id: string, scope: Scope, occurrenceDate: Day | null): Event[] {
    return this.db.transaction(() => {
      const event = live(this.repos.getEvent(id));
      const now = nowIso(this.clock);
      if (event.rrule === null || scope === "all") {
        this.repos.setEventDeleted(event.id, now, now);
        return [];
      }
      this.occurrence(event, occurrenceDate);
      const day = occurrenceDate as Day;
      if (scope === "this") {
        this.repos.insertException(event.id, isoDate(day), nowIso(this.clock));
        return [event];
      }
      if (this.isFirst(event, day)) {
        this.repos.setEventDeleted(event.id, now, now);
        return [];
      }
      const rule = recurrence.endBefore(event.rrule, this.anchor(timingOf(event)), day, this.zone);
      this.repos.updateEvent(event.id, { rrule: rule }, now);
      return [live(this.repos.getEvent(event.id))];
    });
  }

  restore(id: string): Event {
    return this.db.transaction(() => {
      const event = this.repos.getEvent(id);
      if (event?.deleted_at == null) throw new NotFound("No deleted event with this id.");
      this.repos.setEventDeleted(event.id, null, nowIso(this.clock));
      return live(this.repos.getEvent(event.id));
    });
  }

  restoreOccurrence(id: string, day: Day): Event {
    return this.db.transaction(() => {
      const event = live(this.repos.getEvent(id));
      const exc = this.repos.liveException(event.id, isoDate(day));
      if (exc === null) throw new NotFound("That occurrence is not skipped.");
      const now = nowIso(this.clock);
      this.repos.setExceptionDeleted(exc, now, now);
      return event;
    });
  }

  setDone(id: string, day: Day, done: boolean | null): boolean | null {
    return this.db.transaction(() => {
      const event = live(this.repos.getEvent(id));
      if (event.rrule === null) {
        if (this.localDate(timingOf(event)) !== day)
          throw new NotFound("This event does not happen on that date.");
      } else {
        this.occurrence(event, day);
      }
      const dayText = isoDate(day);
      const mark = this.repos.liveMark(event.id, dayText);
      const previous = mark === null ? null : mark.done;
      const now = nowIso(this.clock);
      if (mark !== null && done === null) this.repos.setMarkDeleted(mark.id, now, now);
      else if (mark !== null && done !== null && mark.done !== done)
        this.repos.setMarkDone(mark.id, done, now);
      else if (mark === null && done !== null) this.repos.insertMark(event.id, dayText, done, now);
      return previous;
    });
  }
}

// ------------------------------------------------------------------ routes

function eventOut(e: Event) {
  return {
    id: e.id,
    title: e.title,
    notes: e.notes,
    location: e.location,
    all_day: e.all_day,
    start_at: e.start_at,
    end_at: e.end_at,
    start_date: e.start_date,
    end_date: e.end_date,
    rrule: e.rrule,
    created_at: e.created_at,
    updated_at: e.updated_at,
  };
}

const events = (ctx: DeviceContext) => new EventService(ctx.db, ctx.clock, ctx.zone);
const PATCH_CONTROLS = ["scope", "occurrence_date", "split_id"];

const handlers: Handlers = {
  calendar_list_events: ({ query }, ctx) => {
    const found = events(ctx).inRange(dateDay(query.start), dateDay(query.end));
    return { events: found.events.map(eventOut), occurrences: found.occurrences };
  },
  calendar_get_event: ({ path }, ctx) => eventOut(events(ctx).get(path.event_id)),
  calendar_create_event: ({ body }, ctx) => {
    const timing: Timing = {
      allDay: body.all_day ?? false,
      startAt: body.start_at == null ? null : instant(body.start_at),
      endAt: body.end_at == null ? null : instant(body.end_at),
      startDate: body.start_date ?? null,
      endDate: body.end_date ?? null,
    };
    const [event, isNew] = events(ctx).create({
      id: body.id ?? null,
      title: body.title,
      notes: body.notes ?? "",
      location: body.location ?? "",
      timing,
      rrule: body.rrule ?? null,
    });
    return isNew ? eventOut(event) : new Answer(eventOut(event), 200);
  },
  calendar_update_event: ({ path, body, fields }, ctx) => ({
    events: events(ctx)
      .update(
        path.event_id,
        changesOf(body, fields, PATCH_CONTROLS),
        body.scope ?? "all",
        body.occurrence_date == null ? null : dateDay(body.occurrence_date),
        body.split_id ?? null,
      )
      .map(eventOut),
  }),
  calendar_delete_event: ({ path, query }, ctx) => ({
    events: events(ctx)
      .delete(
        path.event_id,
        query.scope ?? "all",
        query.occurrence_date == null ? null : dateDay(query.occurrence_date),
      )
      .map(eventOut),
  }),
  calendar_restore_event: ({ path }, ctx) => eventOut(events(ctx).restore(path.event_id)),
  calendar_restore_occurrence: ({ path }, ctx) =>
    eventOut(events(ctx).restoreOccurrence(path.event_id, dateDay(path.occurrence_date))),
  calendar_set_done: ({ path, body }, ctx) => {
    const previous = events(ctx).setDone(path.event_id, dateDay(body.occurrence_date), body.done);
    return {
      event_id: path.event_id,
      occurrence_date: body.occurrence_date,
      done: body.done,
      previous,
    };
  },
};

/** Timed and all-day events, recurring series and their occurrences. */
export const calendarDevice: DeviceModule = {
  id: "calendar",
  migrations: {
    owner: "calendar",
    files: import.meta.glob<string>(
      "../../../../../backend/planbox/modules/calendar/migrations/*.sql",
      {
        query: "?raw",
        import: "default",
        eager: true,
      },
    ),
  },
  entityTypes: [
    {
      name: ENTITY_TYPE,
      summarize: (db, ids) => {
        const result = new Map<string, { title: string; deleted: boolean; hint: string }>();
        for (const chunk of chunks(ids)) {
          for (const r of db.all(
            `SELECT id, title, deleted_at FROM calendar_events WHERE id IN (${marks(chunk)})`,
            chunk,
          )) {
            result.set(text(r, "id"), {
              title: text(r, "title"),
              deleted: r.deleted_at !== null,
              hint: "",
            });
          }
        }
        return result;
      },
      activity: (db, window) => {
        const events: ActivityEvent[] = lifecycleEvents(
          db
            .all(
              "SELECT created_at, deleted_at FROM calendar_events WHERE created_at >= :since OR deleted_at >= :since",
              { since: window.since },
            )
            .map(
              (r) =>
                [text(r, "created_at"), textOrNull(r, "deleted_at")] as [string, string | null],
            ),
        );
        const clock = { now: () => instantMs(window.now) };
        for (const at of new EventService(db, clock, window.zone).completions(
          window.since,
          window.now,
        )) {
          events.push({ action: "completed", at });
        }
        return events;
      },
    },
  ],
  handlers,
};
