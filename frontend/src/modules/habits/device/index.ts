/**
 * The habits module on the device: the twin of
 * `backend/planbox/modules/habits/` (ARCHITECTURE §7c). A schedule is an
 * RRULE on floating dates anchored on the start date; check-ins are local
 * dates never in the future; days off are dates the schedule skips.
 */
import { newId } from "../../../core/ids";
import { nowIso, type Clock } from "../../../core/device/clock";
import { changesOf, oneLine, pyStr, unique } from "../../../core/device/common";
import {
  chunks,
  marks,
  text,
  textOrNull,
  type Database,
  type Row,
  type Value,
} from "../../../core/device/db";
import { lifecycleEvents, type ActivityEvent } from "../../../core/device/entities";
import { NotFound, textLength, ValidationFailed } from "../../../core/device/errors";
import { freePosition, place, type Positions } from "../../../core/device/placement";
import * as recurrence from "../../../core/device/recurrence";
import {
  Answer,
  type DeviceContext,
  type DeviceModule,
  type Handlers,
} from "../../../core/device/server";
import { dateDay, DAY_MS, isoDate, localDay, type Day } from "../../../core/device/time";
import { isValidId } from "../../../core/ids";

const ENTITY_TYPE = "habits.habit";
const DEFAULT_RULE = "FREQ=DAILY";
const MAX_NAME = 200;
const MAX_NOTES = 20_000;
const MAX_RANGE_DAYS = 400;
const MAX_DAYS_OFF_CHANGE = 5_000;
const HABIT = "id, name, notes, rrule, start_date, position, created_at, updated_at, deleted_at";
const EDITABLE = new Set(["name", "notes", "rrule", "start_date", "position"]);

interface Habit {
  id: string;
  name: string;
  notes: string;
  rrule: string;
  start_date: string;
  position: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function habitOf(r: Row): Habit {
  return {
    id: text(r, "id"),
    name: text(r, "name"),
    notes: text(r, "notes"),
    rrule: text(r, "rrule"),
    start_date: text(r, "start_date"),
    position: text(r, "position"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

class HabitRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Habit | null {
    const row = this.db.get(`SELECT ${HABIT} FROM habits WHERE id = ?`, [id]);
    return row === undefined ? null : habitOf(row);
  }

  listLive(): Habit[] {
    return this.db
      .all(`SELECT ${HABIT} FROM habits WHERE deleted_at IS NULL ORDER BY position, id`)
      .map(habitOf);
  }

  positions(excludeId: string | null = null): Positions {
    return this.db
      .all(
        "SELECT id, position FROM habits WHERE deleted_at IS NULL AND id IS NOT ? ORDER BY position, id",
        [excludeId],
      )
      .map((r) => [text(r, "id"), text(r, "position")]);
  }

  insert(h: Habit): void {
    this.db.run(
      `INSERT INTO habits (${HABIT}) VALUES (:id, :name, :notes, :rrule, :start_date, :position, :created_at, :updated_at, :deleted_at)`,
      { ...h },
    );
  }

  update(id: string, fields: Record<string, Value>, now: string): void {
    const names = Object.keys(fields);
    if (names.some((n) => !EDITABLE.has(n))) throw new Error("cannot update that on habits");
    if (names.length === 0) return;
    this.db.run(
      `UPDATE habits SET ${names.map((n) => `${n} = :${n}`).join(", ")}, updated_at = :updated_at WHERE id = :id`,
      {
        ...fields,
        updated_at: now,
        id,
      },
    );
  }

  setDeleted(id: string, deletedAt: string | null, now: string): void {
    this.db.run("UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      deletedAt,
      now,
      id,
    ]);
  }
}

/** A table of one live row per habit and day (check-ins, days off). */
class DayRepository {
  constructor(
    private readonly db: Database,
    private readonly table: "habits_checkins" | "habits_days_off",
  ) {}

  liveOn(habitId: string, day: string): string | null {
    const row = this.db.get(
      `SELECT id FROM ${this.table} WHERE habit_id = ? AND day = ? AND deleted_at IS NULL`,
      [habitId, day],
    );
    return row === undefined ? null : text(row, "id");
  }

  liveDays(habitIds: readonly string[]): Map<string, string[]> {
    const result = new Map<string, string[]>(habitIds.map((id) => [id, []]));
    for (const chunk of chunks(habitIds)) {
      for (const r of this.db.all(
        `SELECT habit_id, day FROM ${this.table} WHERE deleted_at IS NULL AND habit_id IN (${marks(chunk)}) ORDER BY day`,
        chunk,
      )) {
        result.get(text(r, "habit_id"))?.push(text(r, "day"));
      }
    }
    return result;
  }

  insert(habitId: string, day: string, now: string): void {
    this.db.run(
      `INSERT INTO ${this.table} (id, habit_id, day, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`,
      [newId(), habitId, day, now, now],
    );
  }

  setDeleted(id: string, deletedAt: string, now: string): void {
    this.db.run(`UPDATE ${this.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
      deletedAt,
      now,
      id,
    ]);
  }
}

/** Current and best streak over scheduled days (an open today does not break it). */
export function streaks(
  scheduled: Iterable<Day>,
  checked: ReadonlySet<Day>,
  today: Day,
): [number, number] {
  let run = 0;
  let best = 0;
  for (const day of scheduled) {
    if (checked.has(day)) {
      run += 1;
      best = Math.max(best, run);
    } else if (day < today) {
      run = 0;
    }
  }
  return [run, best];
}

function cleanName(name: string): string {
  const cleaned = oneLine(name);
  if (!cleaned) throw new ValidationFailed("A habit needs a name.");
  if (textLength(cleaned) > MAX_NAME)
    throw new ValidationFailed(`Names are at most ${String(MAX_NAME)} characters.`);
  return cleaned;
}

function cleanNotes(notes: string): string {
  if (textLength(notes) > MAX_NOTES)
    throw new ValidationFailed(`Notes are at most ${String(MAX_NOTES)} characters.`);
  return notes;
}

function live(h: Habit | null): Habit {
  if (h?.deleted_at !== null) throw new NotFound("No habit with this id.");
  return h;
}

class HabitService {
  private readonly habits: HabitRepository;
  private readonly checkins: DayRepository;
  private readonly daysOff: DayRepository;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly zone: string,
  ) {
    this.habits = new HabitRepository(db);
    this.checkins = new DayRepository(db, "habits_checkins");
    this.daysOff = new DayRepository(db, "habits_days_off");
  }

  private today(): Day {
    return localDay(this.clock.now(), this.zone);
  }

  private normalize(rule: string, start: Day): string {
    try {
      return recurrence.normalize(rule, recurrence.allDayAnchor(start, start), this.zone);
    } catch (error) {
      if (error instanceof recurrence.RecurrenceError) throw new ValidationFailed(error.message);
      throw error;
    }
  }

  overview(start: Day, end: Day) {
    if (end < start) throw new ValidationFailed("The range ends before it starts.");
    if (end - start >= MAX_RANGE_DAYS)
      throw new ValidationFailed(`Ask for at most ${String(MAX_RANGE_DAYS)} days at a time.`);
    const habits = this.habits.listLive();
    const ids = habits.map((h) => h.id);
    const days = this.checkins.liveDays(ids);
    const off = this.daysOff.liveDays(ids);
    const today = this.today();
    return habits.map((h) =>
      this.view(h, days.get(h.id) ?? [], off.get(h.id) ?? [], start, end, today),
    );
  }

  create(input: {
    name: string;
    id: string | null;
    notes: string;
    rrule: string | null;
    startDate: string | null;
  }): [Habit, boolean] {
    if (input.id !== null && !isValidId(input.id))
      throw new ValidationFailed("Ids must be lowercase UUIDv7.");
    const name = cleanName(input.name);
    const notes = cleanNotes(input.notes);
    const start = input.startDate === null ? this.today() : dateDay(input.startDate);
    const rule = this.normalize(
      input.rrule === null || input.rrule === "" ? DEFAULT_RULE : input.rrule,
      start,
    );
    return this.db.transaction(() => {
      if (input.id !== null) {
        const existing = this.habits.get(input.id);
        if (existing !== null) return [existing, false];
      }
      const now = nowIso(this.clock);
      const habit: Habit = {
        id: input.id ?? newId(),
        name,
        notes,
        rrule: rule,
        start_date: isoDate(start),
        position: place(this.habits.positions(), null, null),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.habits.insert(habit);
      return [habit, true];
    });
  }

  update(id: string, changes: ReadonlyMap<string, unknown>): Habit {
    return this.db.transaction(() => {
      const habit = live(this.habits.get(id));
      const fields: Record<string, Value> = {};
      if (changes.has("name")) fields.name = cleanName(pyStr(changes.get("name")));
      if (changes.has("notes")) fields.notes = cleanNotes(pyStr(changes.get("notes")));
      if (changes.has("start_date") || changes.has("rrule")) {
        const startValue = changes.get("start_date");
        const start =
          typeof startValue === "string" ? dateDay(startValue) : dateDay(habit.start_date);
        const ruleValue = changes.get("rrule");
        const rule = typeof ruleValue === "string" && ruleValue ? ruleValue : habit.rrule;
        fields.start_date = isoDate(start);
        fields.rrule = this.normalize(rule, start);
      }
      this.habits.update(id, fields, nowIso(this.clock));
      return live(this.habits.get(id));
    });
  }

  delete(id: string): string {
    return this.db.transaction(() => {
      live(this.habits.get(id));
      const now = nowIso(this.clock);
      this.habits.setDeleted(id, now, now);
      return now;
    });
  }

  restore(id: string): Habit {
    return this.db.transaction(() => {
      const habit = this.habits.get(id);
      if (habit?.deleted_at == null) throw new NotFound("No deleted habit with this id.");
      const now = nowIso(this.clock);
      const position = freePosition(this.habits.positions(), habit.position);
      this.habits.setDeleted(id, null, now);
      this.habits.update(id, { position }, now);
      return live(this.habits.get(id));
    });
  }

  check(id: string, day: Day): void {
    if (day > this.today())
      throw new ValidationFailed("You cannot check off a day that has not come yet.");
    this.db.transaction(() => {
      const habit = live(this.habits.get(id));
      const now = nowIso(this.clock);
      if (day < dateDay(habit.start_date)) this.moveStart(habit, day, now);
      if (this.checkins.liveOn(id, isoDate(day)) !== null) return;
      this.checkins.insert(id, isoDate(day), now);
    });
  }

  uncheck(id: string, day: Day): void {
    this.db.transaction(() => {
      live(this.habits.get(id));
      const existing = this.checkins.liveOn(id, isoDate(day));
      if (existing !== null) {
        const now = nowIso(this.clock);
        this.checkins.setDeleted(existing, now, now);
      }
    });
  }

  setDaysOff(items: readonly [string, string][], off: boolean): [string, string][] {
    if (items.length > MAX_DAYS_OFF_CHANGE) {
      throw new ValidationFailed(`Change at most ${String(MAX_DAYS_OFF_CHANGE)} days at a time.`);
    }
    return this.db.transaction(() => {
      for (const habitId of unique(items.map(([h]) => h))) live(this.habits.get(habitId));
      const now = nowIso(this.clock);
      const changed: [string, string][] = [];
      const seen = new Set<string>();
      for (const [habitId, day] of items) {
        const key = `${habitId}|${day}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const existing = this.daysOff.liveOn(habitId, day);
        if (off && existing === null) this.daysOff.insert(habitId, day, now);
        else if (!off && existing !== null) this.daysOff.setDeleted(existing, now, now);
        else continue;
        changed.push([habitId, day]);
      }
      return changed;
    });
  }

  private moveStart(habit: Habit, start: Day, now: string): void {
    let rule: string;
    try {
      rule = this.normalize(habit.rrule, start);
    } catch (error) {
      if (error instanceof ValidationFailed) return;
      throw error;
    }
    this.habits.update(habit.id, { start_date: isoDate(start), rrule: rule }, now);
  }

  private view(
    habit: Habit,
    checkedDays: string[],
    offDays: string[],
    start: Day,
    end: Day,
    today: Day,
  ) {
    const first = dateDay(habit.start_date);
    const anchor = recurrence.allDayAnchor(first, first);
    const off = new Set(offDays.map(dateDay));
    const scheduled = (lo: Day, hi: Day): Day[] => {
      if (hi < lo) return [];
      return recurrence
        .between(habit.rrule, anchor, lo * DAY_MS, (hi + 1) * DAY_MS)
        .map((s) => s.occurrenceDate)
        .filter((d) => !off.has(d));
    };
    const checked = new Set(checkedDays.map(dateDay));
    const [current, best] = streaks(scheduled(first, today), checked, today);
    const startIso = isoDate(start);
    const endIso = isoDate(end);
    return {
      ...habitOut(habit),
      checkins: checkedDays.filter((d) => startIso <= d && d <= endIso),
      scheduled: scheduled(Math.max(start, first), end).map(isoDate),
      days_off: offDays.filter((d) => startIso <= d && d <= endIso),
      days_off_ahead: offDays.filter((d) => d >= isoDate(today)),
      current_streak: current,
      best_streak: best,
      total_checkins: checkedDays.length,
    };
  }
}

function habitOut(h: Habit) {
  return {
    id: h.id,
    name: h.name,
    notes: h.notes,
    rrule: h.rrule,
    start_date: h.start_date,
    position: h.position,
    created_at: h.created_at,
    updated_at: h.updated_at,
  };
}

const habits = (ctx: DeviceContext) => new HabitService(ctx.db, ctx.clock, ctx.zone);

const handlers: Handlers = {
  habits_list_habits: ({ query }, ctx) =>
    habits(ctx).overview(dateDay(query.start), dateDay(query.end)),
  habits_create_habit: ({ body }, ctx) => {
    const [habit, isNew] = habits(ctx).create({
      name: body.name,
      id: body.id ?? null,
      notes: body.notes ?? "",
      rrule: body.rrule ?? null,
      startDate: body.start_date ?? null,
    });
    return isNew ? habitOut(habit) : new Answer(habitOut(habit), 200);
  },
  habits_update_habit: ({ path, body, fields }, ctx) => {
    const changes = changesOf(body, fields);
    for (const required of ["name", "notes", "rrule", "start_date"]) {
      if (changes.has(required) && changes.get(required) === null) {
        throw new ValidationFailed(`${required} cannot be null.`);
      }
    }
    return habitOut(habits(ctx).update(path.habit_id, changes));
  },
  habits_delete_habit: ({ path }, ctx) => ({
    id: path.habit_id,
    deleted_at: habits(ctx).delete(path.habit_id),
  }),
  habits_restore_habit: ({ path }, ctx) => habitOut(habits(ctx).restore(path.habit_id)),
  habits_check_habit: ({ path }, ctx) => {
    habits(ctx).check(path.habit_id, dateDay(path.day));
    return { habit_id: path.habit_id, day: path.day, checked: true };
  },
  habits_uncheck_habit: ({ path }, ctx) => {
    habits(ctx).uncheck(path.habit_id, dateDay(path.day));
    return { habit_id: path.habit_id, day: path.day, checked: false };
  },
  habits_change_days_off: ({ body }, ctx) => ({
    items: habits(ctx)
      .setDaysOff(
        body.items.map((i) => [i.habit_id, i.day]),
        body.off,
      )
      .map(([habit_id, day]) => ({ habit_id, day })),
  }),
};

/** Habits on a schedule, daily check-ins and streaks. */
export const habitsDevice: DeviceModule = {
  id: "habits",
  migrations: {
    owner: "habits",
    files: import.meta.glob<string>(
      "../../../../../backend/planbox/modules/habits/migrations/*.sql",
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
            `SELECT id, name, deleted_at FROM habits WHERE id IN (${marks(chunk)})`,
            chunk,
          )) {
            result.set(text(r, "id"), {
              title: text(r, "name"),
              deleted: r.deleted_at !== null,
              hint: "Habit",
            });
          }
        }
        return result;
      },
      documents: (db, since) =>
        db
          .all(
            "SELECT id, name, notes, deleted_at, updated_at FROM habits WHERE :since IS NULL OR updated_at >= :since",
            {
              since,
            },
          )
          .map((r) => ({
            id: text(r, "id"),
            title: text(r, "name"),
            body: text(r, "notes"),
            deleted: r.deleted_at !== null,
            updatedAt: text(r, "updated_at"),
          })),
      activity: (db, window) => {
        const events: ActivityEvent[] = lifecycleEvents(
          db
            .all(
              "SELECT created_at, deleted_at FROM habits WHERE created_at >= :since OR deleted_at >= :since",
              {
                since: window.since,
              },
            )
            .map(
              (r) =>
                [text(r, "created_at"), textOrNull(r, "deleted_at")] as [string, string | null],
            ),
        );
        for (const r of db.all(
          "SELECT created_at FROM habits_checkins WHERE deleted_at IS NULL AND created_at >= ?",
          [window.since],
        )) {
          events.push({ action: "completed", at: text(r, "created_at") });
        }
        return events;
      },
    },
  ],
  handlers,
};
