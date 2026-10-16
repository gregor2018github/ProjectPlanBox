/**
 * Todos use cases on the device: the twin of
 * `backend/planbox/modules/todos/service.py` (ARCHITECTURE §7). Keep the
 * rules in step: placement invariants, one-level subtasks, completion
 * cascading to subtasks, deletes cascading with one shared `deleted_at`,
 * and repeating todos inserting their next occurrence on completion.
 */
import { newId } from "../../../core/ids";
import { keyBetween } from "../../../core/ordering";
import { nowIso, type Clock } from "../../../core/device/clock";
import { checkClientId, oneLine, pyStr } from "../../../core/device/common";
import type { Database } from "../../../core/device/db";
import { Conflict, NotFound, textLength, ValidationFailed } from "../../../core/device/errors";
import { freePosition, place } from "../../../core/device/placement";
import * as recurrence from "../../../core/device/recurrence";
import { TagService } from "../../../core/device/tags";
import { dateDay, isoDate, localDay, type Day } from "../../../core/device/time";
import {
  AreaRepository,
  ListRepository,
  SectionRepository,
  TodoRepository,
  type Area,
  type Fields,
  type Section,
  type Todo,
  type TodoList,
} from "./repository";
import { computeStats, type TodoStats } from "./stats";

/** The entity type of todos. */
export const ENTITY_TYPE = "todos.todo";
const MAX_NAME = 200;
const MAX_TITLE = 500;
const MAX_NOTES = 20_000;
const MAX_FORECAST_DAYS = 400;
const MAX_HUE = 359;
/** Default area hues; mirrored in `areaHues.ts` and migration `todos/0005`. */
export const AREA_HUES = [264, 155, 30, 210, 310, 80, 350, 185];

/** What a cascading soft delete touched. */
export interface Deletion {
  deleted_at: string;
  areas: number;
  lists: number;
  sections: number;
  todos: number;
}

/** A todo with its tag ids. */
export interface TodoRecord {
  todo: Todo;
  tagIds: string[];
}

/** Where a todo lives. */
export interface Placement {
  listId: string | null;
  sectionId: string | null;
  parentId: string | null;
}

/** A later date of an open repeating todo. */
export interface ForecastDate {
  todoId: string;
  date: Day;
}

function deletion(stamp: string, counts: Partial<Omit<Deletion, "deleted_at">>): Deletion {
  return { deleted_at: stamp, areas: 0, lists: 0, sections: 0, todos: 0, ...counts };
}

function checkHue(hue: number): number {
  if (hue < 0 || hue > MAX_HUE) throw new ValidationFailed("An area hue is 0 to 359 degrees.");
  return hue;
}

/** The first default hue no live area uses, else cycles by area count. */
export function defaultAreaHue(taken: readonly number[]): number {
  const used = new Set(taken);
  return (
    AREA_HUES.find((h) => !used.has(h)) ?? (AREA_HUES[taken.length % AREA_HUES.length] as number)
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cleanName(name: string, what: string): string {
  const cleaned = oneLine(name);
  if (!cleaned) throw new ValidationFailed(`A ${what} needs a name.`);
  if (textLength(cleaned) > MAX_NAME) {
    throw new ValidationFailed(
      `${capitalize(what)} names are at most ${String(MAX_NAME)} characters.`,
    );
  }
  return cleaned;
}

function cleanTitle(title: string): string {
  const cleaned = oneLine(title);
  if (!cleaned) throw new ValidationFailed("A todo needs a title.");
  if (textLength(cleaned) > MAX_TITLE)
    throw new ValidationFailed(`Titles are at most ${String(MAX_TITLE)} characters.`);
  return cleaned;
}

function cleanNotes(notes: string): string {
  if (textLength(notes) > MAX_NOTES)
    throw new ValidationFailed(`Notes are at most ${String(MAX_NOTES)} characters.`);
  return notes;
}

function cleanPriority(priority: number): number {
  if (priority < 0 || priority > 3) throw new ValidationFailed("Priority is 0 (none) to 3 (high).");
  return priority;
}

function cleanRepeatFrom(value: unknown): "due" | "completion" {
  if (value !== "due" && value !== "completion") {
    throw new ValidationFailed('repeat_from must be "due" or "completion".');
  }
  return value;
}

function live<T extends { deleted_at: string | null }>(row: T | null, what: string): T {
  if (row?.deleted_at !== null) throw new NotFound(`No ${what} with this id.`);
  return row;
}

function deleted<T extends { deleted_at: string | null }>(
  row: T | null,
  what: string,
): [T, string] {
  if (row?.deleted_at == null) throw new NotFound(`No deleted ${what} with this id.`);
  return [row, row.deleted_at];
}

/** The module's repositories on one connection. */
export class Repositories {
  readonly areas: AreaRepository;
  readonly lists: ListRepository;
  readonly sections: SectionRepository;
  readonly todos: TodoRepository;

  constructor(db: Database) {
    this.areas = new AreaRepository(db);
    this.lists = new ListRepository(db);
    this.sections = new SectionRepository(db);
    this.todos = new TodoRepository(db);
  }
}

// -------------------------------------------------------------------- areas

/** Areas group lists. */
export class AreaService {
  private readonly repos: Repositories;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    this.repos = new Repositories(db);
  }

  listLive(): Area[] {
    return this.repos.areas.listLive();
  }

  create(name: string, areaId: string | null, hue: number | null): [Area, boolean] {
    checkClientId(areaId);
    const cleaned = cleanName(name, "area");
    if (hue !== null) checkHue(hue);
    return this.db.transaction(() => {
      if (areaId !== null) {
        const existing = this.repos.areas.get(areaId);
        if (existing !== null) return [existing, false];
      }
      const now = nowIso(this.clock);
      const area: Area = {
        id: areaId ?? newId(),
        name: cleaned,
        hue: hue ?? defaultAreaHue(this.repos.areas.listLive().map((a) => a.hue)),
        position: place(this.repos.areas.positions(), null, null),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.repos.areas.insert(area);
      return [area, true];
    });
  }

  update(areaId: string, name: string | null, hue: number | null): Area {
    const fields: Fields = {};
    if (name !== null) fields.name = cleanName(name, "area");
    if (hue !== null) fields.hue = checkHue(hue);
    return this.db.transaction(() => {
      live(this.repos.areas.get(areaId), "area");
      this.repos.areas.update(areaId, fields, nowIso(this.clock));
      return live(this.repos.areas.get(areaId), "area");
    });
  }

  move(areaId: string, beforeId: string | null, afterId: string | null): Area {
    return this.db.transaction(() => {
      live(this.repos.areas.get(areaId), "area");
      const position = place(this.repos.areas.positions(areaId), beforeId, afterId);
      this.repos.areas.update(areaId, { position }, nowIso(this.clock));
      return live(this.repos.areas.get(areaId), "area");
    });
  }

  delete(areaId: string): Deletion {
    return this.db.transaction(() => {
      live(this.repos.areas.get(areaId), "area");
      const now = nowIso(this.clock);
      const listIds = this.repos.lists.liveIdsInArea(areaId);
      const sectionIds = this.repos.sections.liveIdsInLists(listIds);
      const todoIds = this.repos.todos.liveIdsIn("list_id", listIds);
      const todos = this.repos.todos.setDeleted(todoIds, now, now);
      const sections = this.repos.sections.setDeleted(sectionIds, now, now);
      const lists = this.repos.lists.setDeleted(listIds, now, now);
      this.repos.areas.setDeleted(areaId, now, now);
      return deletion(now, { areas: 1, lists, sections, todos });
    });
  }

  restore(areaId: string): Deletion {
    return this.db.transaction(() => {
      const [area, stamp] = deleted(this.repos.areas.get(areaId), "area");
      const now = nowIso(this.clock);
      const listIds = this.repos.lists.idsDeletedWith(areaId, stamp);
      const sectionIds = this.repos.sections.idsDeletedWith(listIds, stamp);
      const todoIds = this.repos.todos.idsDeletedWith("list_id", listIds, stamp);
      const position = freePosition(this.repos.areas.positions(), area.position);
      this.repos.areas.setDeleted(areaId, null, now);
      this.repos.areas.update(areaId, { position }, now);
      const lists = this.repos.lists.setDeleted(listIds, null, now);
      const sections = this.repos.sections.setDeleted(sectionIds, null, now);
      const todos = this.repos.todos.setDeleted(todoIds, null, now);
      return deletion(stamp, { areas: 1, lists, sections, todos });
    });
  }
}

// -------------------------------------------------------------------- lists

/** Lists hold todos, optionally inside an area. */
export class ListService {
  private readonly repos: Repositories;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    this.repos = new Repositories(db);
  }

  listLive(): TodoList[] {
    return this.repos.lists.listLive();
  }

  create(name: string, areaId: string | null, listId: string | null): [TodoList, boolean] {
    checkClientId(listId);
    const cleaned = cleanName(name, "list");
    return this.db.transaction(() => {
      if (listId !== null) {
        const existing = this.repos.lists.get(listId);
        if (existing !== null) return [existing, false];
      }
      this.checkArea(areaId);
      const now = nowIso(this.clock);
      const list: TodoList = {
        id: listId ?? newId(),
        area_id: areaId,
        name: cleaned,
        position: place(this.repos.lists.positions(areaId), null, null),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.repos.lists.insert(list);
      return [list, true];
    });
  }

  rename(listId: string, name: string): TodoList {
    const cleaned = cleanName(name, "list");
    return this.db.transaction(() => {
      live(this.repos.lists.get(listId), "list");
      this.repos.lists.update(listId, { name: cleaned }, nowIso(this.clock));
      return live(this.repos.lists.get(listId), "list");
    });
  }

  move(
    listId: string,
    areaId: string | null,
    beforeId: string | null,
    afterId: string | null,
  ): TodoList {
    return this.db.transaction(() => {
      live(this.repos.lists.get(listId), "list");
      this.checkArea(areaId);
      const position = place(this.repos.lists.positions(areaId, listId), beforeId, afterId);
      this.repos.lists.update(listId, { area_id: areaId, position }, nowIso(this.clock));
      return live(this.repos.lists.get(listId), "list");
    });
  }

  delete(listId: string): Deletion {
    return this.db.transaction(() => {
      live(this.repos.lists.get(listId), "list");
      const now = nowIso(this.clock);
      const sectionIds = this.repos.sections.liveIdsInLists([listId]);
      const todoIds = this.repos.todos.liveIdsIn("list_id", [listId]);
      const todos = this.repos.todos.setDeleted(todoIds, now, now);
      const sections = this.repos.sections.setDeleted(sectionIds, now, now);
      this.repos.lists.setDeleted([listId], now, now);
      return deletion(now, { lists: 1, sections, todos });
    });
  }

  restore(listId: string): Deletion {
    return this.db.transaction(() => {
      const [list, stamp] = deleted(this.repos.lists.get(listId), "list");
      if (list.area_id !== null) {
        const area = this.repos.areas.get(list.area_id);
        if (area?.deleted_at !== null) {
          throw new Conflict("This list's area is deleted. Restore the area first.");
        }
      }
      const now = nowIso(this.clock);
      const sectionIds = this.repos.sections.idsDeletedWith([listId], stamp);
      const todoIds = this.repos.todos.idsDeletedWith("list_id", [listId], stamp);
      const position = freePosition(this.repos.lists.positions(list.area_id), list.position);
      this.repos.lists.setDeleted([listId], null, now);
      this.repos.lists.update(listId, { position }, now);
      const sections = this.repos.sections.setDeleted(sectionIds, null, now);
      const todos = this.repos.todos.setDeleted(todoIds, null, now);
      return deletion(stamp, { lists: 1, sections, todos });
    });
  }

  private checkArea(areaId: string | null): void {
    if (areaId === null) return;
    const area = this.repos.areas.get(areaId);
    if (area?.deleted_at !== null) throw new ValidationFailed("Unknown area.");
  }
}

// ----------------------------------------------------------------- sections

/** Sections are headings inside a list. */
export class SectionService {
  private readonly repos: Repositories;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    this.repos = new Repositories(db);
  }

  listLive(): Section[] {
    return this.repos.sections.listLive();
  }

  create(
    listId: string,
    name: string,
    sectionId: string | null,
    beforeId: string | null,
    afterId: string | null,
  ): [Section, boolean] {
    checkClientId(sectionId);
    const cleaned = cleanName(name, "section");
    return this.db.transaction(() => {
      if (sectionId !== null) {
        const existing = this.repos.sections.get(sectionId);
        if (existing !== null) return [existing, false];
      }
      this.checkList(listId);
      const now = nowIso(this.clock);
      const section: Section = {
        id: sectionId ?? newId(),
        list_id: listId,
        name: cleaned,
        position: place(this.repos.sections.positions(listId), beforeId, afterId),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.repos.sections.insert(section);
      return [section, true];
    });
  }

  rename(sectionId: string, name: string): Section {
    const cleaned = cleanName(name, "section");
    return this.db.transaction(() => {
      live(this.repos.sections.get(sectionId), "section");
      this.repos.sections.update(sectionId, { name: cleaned }, nowIso(this.clock));
      return live(this.repos.sections.get(sectionId), "section");
    });
  }

  move(
    sectionId: string,
    listId: string,
    beforeId: string | null,
    afterId: string | null,
  ): Section {
    return this.db.transaction(() => {
      const section = live(this.repos.sections.get(sectionId), "section");
      this.checkList(listId);
      const position = place(this.repos.sections.positions(listId, sectionId), beforeId, afterId);
      const now = nowIso(this.clock);
      this.repos.sections.update(sectionId, { list_id: listId, position }, now);
      if (section.list_id !== listId) this.repos.todos.setListOfSection(sectionId, listId, now);
      return live(this.repos.sections.get(sectionId), "section");
    });
  }

  delete(sectionId: string): Deletion {
    return this.db.transaction(() => {
      live(this.repos.sections.get(sectionId), "section");
      const now = nowIso(this.clock);
      const todoIds = this.repos.todos.liveIdsIn("section_id", [sectionId]);
      const todos = this.repos.todos.setDeleted(todoIds, now, now);
      this.repos.sections.setDeleted([sectionId], now, now);
      return deletion(now, { sections: 1, todos });
    });
  }

  restore(sectionId: string): Deletion {
    return this.db.transaction(() => {
      const [section, stamp] = deleted(this.repos.sections.get(sectionId), "section");
      const owner = this.repos.lists.get(section.list_id);
      if (owner?.deleted_at !== null) {
        throw new Conflict("This section's list is deleted. Restore the list first.");
      }
      const now = nowIso(this.clock);
      const todoIds = this.repos.todos.idsDeletedWith("section_id", [sectionId], stamp);
      const position = freePosition(
        this.repos.sections.positions(section.list_id),
        section.position,
      );
      this.repos.sections.setDeleted([sectionId], null, now);
      this.repos.sections.update(sectionId, { position }, now);
      const todos = this.repos.todos.setDeleted(todoIds, null, now);
      return deletion(stamp, { sections: 1, todos });
    });
  }

  private checkList(listId: string): void {
    const list = this.repos.lists.get(listId);
    if (list?.deleted_at !== null) throw new ValidationFailed("Unknown list.");
  }
}

// -------------------------------------------------------------------- todos

/** Input for creating a todo. */
export interface NewTodo {
  title: string;
  placement: Placement;
  id: string | null;
  notes: string;
  priority: number;
  dueDate: string | null;
  tagIds: readonly string[];
  beforeId: string | null;
  afterId: string | null;
  rrule: string | null;
  repeatFrom: string;
}

/** One page of the logbook. */
export interface LogbookPage {
  records: TodoRecord[];
  nextCursor: string | null;
}

/** Todos and subtasks. */
export class TodoService {
  private readonly repos: Repositories;
  private readonly tags: TagService;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly zone: string,
  ) {
    this.repos = new Repositories(db);
    this.tags = new TagService(db, clock);
  }

  // ---- reads

  current(completedSince: string): TodoRecord[] {
    return this.records(this.repos.todos.listCurrent(completedSince));
  }

  logbook(cursor: string | null, limit: number): LogbookPage {
    const before = parseCursor(cursor);
    const rows = this.repos.todos.listCompleted(before, limit + 1);
    const page = rows.slice(0, limit);
    const more = rows.length > limit;
    const last = page.at(-1);
    const nextCursor =
      more && last !== undefined ? `${String(last.completed_at)}|${last.id}` : null;
    return { records: this.records(page), nextCursor };
  }

  /** Statistics; with `tagFilter`, only todos carrying every one of those tags count. */
  stats(tagFilter: readonly string[] = []): TodoStats {
    const all = this.repos.todos.listAll();
    const tagIds = this.tags.tagsFor(
      ENTITY_TYPE,
      all.map((t) => t.id),
    );
    const todos =
      tagFilter.length === 0
        ? all
        : all.filter((t) => tagFilter.every((tag) => tagIds.get(t.id)?.includes(tag) === true));
    const liveTagIds = new Map(
      todos.filter((t) => t.deleted_at === null).map((t) => [t.id, tagIds.get(t.id) ?? []]),
    );
    return computeStats(todos, {
      lists: this.repos.lists.listLive(),
      areas: this.repos.areas.listLive(),
      tagIds: liveTagIds,
      now: this.clock.now(),
      zone: this.zone,
    });
  }

  get(todoId: string): TodoRecord {
    return this.record(live(this.repos.todos.get(todoId), "todo"));
  }

  // ---- writes

  create(input: NewTodo): [TodoRecord, boolean] {
    checkClientId(input.id);
    const title = cleanTitle(input.title);
    const notes = cleanNotes(input.notes);
    const priority = cleanPriority(input.priority);
    return this.db.transaction(() => {
      if (input.id !== null) {
        const existing = this.repos.todos.get(input.id);
        if (existing !== null) return [this.record(existing), false];
      }
      this.checkPlacement(input.placement, null);
      const p = input.placement;
      let dueDate: Day | null = input.dueDate === null ? null : dateDay(input.dueDate);
      let rule: string | null = null;
      let anchor: Day | null = null;
      let repeatFrom: "due" | "completion" = "due";
      if (input.rrule !== null) {
        if (p.parentId !== null)
          throw new ValidationFailed("Subtasks cannot repeat; let their parent repeat.");
        repeatFrom = cleanRepeatFrom(input.repeatFrom);
        [rule, anchor] = this.startSeries(input.rrule, dueDate, repeatFrom);
        dueDate = anchor;
      }
      const now = nowIso(this.clock);
      const siblings = this.repos.todos.positions(p.listId, p.sectionId, p.parentId);
      const todo: Todo = {
        id: input.id ?? newId(),
        list_id: p.listId,
        section_id: p.sectionId,
        parent_id: p.parentId,
        title,
        notes,
        priority,
        due_date: dueDate === null ? null : isoDate(dueDate),
        position: place(siblings, input.beforeId, input.afterId),
        completed_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        rrule: rule,
        recurrence_anchor: anchor === null ? null : isoDate(anchor),
        recurs_from_id: null,
        today_position: null,
        repeat_from: repeatFrom,
        rank_position: null,
        today_rank_position: null,
      };
      this.repos.todos.insert(todo);
      if (input.tagIds.length > 0)
        this.tags.setTags({ entityType: ENTITY_TYPE, entityId: todo.id }, input.tagIds);
      return [this.record(todo), true];
    });
  }

  /** Changes the fields present in `changes` (see the Python twin for the rules). */
  update(todoId: string, changes: ReadonlyMap<string, unknown>): TodoRecord {
    const fields: Fields = {};
    for (const [key, value] of changes) {
      if (key === "title" && typeof value === "string") fields.title = cleanTitle(value);
      else if (key === "notes" && typeof value === "string") fields.notes = cleanNotes(value);
      else if (key === "priority" && typeof value === "number")
        fields.priority = cleanPriority(value);
      else if (key === "due_date" && (value === null || typeof value === "string"))
        fields.due_date = value;
      else if (
        (key === "rrule" || key === "repeat_from") &&
        (value === null || typeof value === "string")
      )
        continue;
      else if (key === "tag_ids") continue;
      else throw new ValidationFailed(`Cannot change '${key}' like that.`);
    }
    return this.db.transaction(() => {
      const todo = live(this.repos.todos.get(todoId), "todo");
      Object.assign(fields, this.repeatFields(todo, changes));
      if ("due_date" in fields && fields.due_date !== todo.due_date) {
        Object.assign(fields, this.redatedKeys(fields.due_date ?? null));
      }
      if (Object.keys(fields).length > 0)
        this.repos.todos.update(todoId, fields, nowIso(this.clock));
      const tagIds = changes.get("tag_ids");
      if (tagIds !== undefined && tagIds !== null) {
        if (!Array.isArray(tagIds)) throw new ValidationFailed("tag_ids must be a list.");
        this.tags.setTags({ entityType: ENTITY_TYPE, entityId: todo.id }, tagIds.map(String));
      }
      return this.record(live(this.repos.todos.get(todoId), "todo"));
    });
  }

  complete(todoId: string): TodoRecord[] {
    return this.db.transaction(() => {
      const todo = live(this.repos.todos.get(todoId), "todo");
      if (todo.completed_at !== null) return [this.record(todo)];
      const children = this.repos.todos.liveChildren(todoId);
      const openChildren = children.filter((c) => c.completed_at === null).map((c) => c.id);
      const now = nowIso(this.clock);
      const changed = [todoId, ...openChildren];
      this.repos.todos.setCompleted(changed, now, now);
      changed.push(...this.insertNext(todo, children, now));
      return this.records(this.repos.todos.getMany(changed));
    });
  }

  reopen(todoId: string): TodoRecord[] {
    return this.db.transaction(() => {
      const todo = live(this.repos.todos.get(todoId), "todo");
      if (todo.completed_at === null) return [this.record(todo)];
      const now = nowIso(this.clock);
      const changed = [todoId];
      this.withdrawNext(todo, now);
      if (todo.parent_id === null) {
        changed.push(
          ...this.repos.todos
            .liveChildren(todoId)
            .filter((c) => c.completed_at === todo.completed_at)
            .map((c) => c.id),
        );
      } else {
        const parent = this.repos.todos.get(todo.parent_id);
        if (parent !== null && parent.completed_at !== null) {
          changed.push(parent.id);
          this.withdrawNext(parent, now);
        }
      }
      this.repos.todos.setCompleted(changed, null, now);
      return this.records(this.repos.todos.getMany(changed));
    });
  }

  skip(todoId: string): TodoRecord {
    return this.db.transaction(() => {
      const todo = live(this.repos.todos.get(todoId), "todo");
      if (todo.rrule === null || todo.due_date === null || todo.recurrence_anchor === null) {
        throw new ValidationFailed("Only a repeating todo can skip a date.");
      }
      if (todo.completed_at !== null)
        throw new Conflict("This todo is done. Reopen it to skip it instead.");
      const due = dateDay(todo.due_date);
      const today = this.today();
      let nextDue: Day | null;
      if (todo.repeat_from === "completion") {
        let following = recurrence.step(todo.rrule, due);
        while (following < today) following = recurrence.step(todo.rrule, following);
        const until = recurrence.floatingUntil(todo.rrule);
        nextDue = until !== null && following > until ? null : following;
      } else {
        nextDue = recurrence.dateAfter(
          todo.rrule,
          dateDay(todo.recurrence_anchor),
          Math.max(due, today - 1),
        );
      }
      if (nextDue === null)
        throw new Conflict("This is the last date of the repeat. Complete or delete it.");
      this.repos.todos.update(
        todoId,
        { due_date: isoDate(nextDue), today_position: null },
        nowIso(this.clock),
      );
      return this.record(live(this.repos.todos.get(todoId), "todo"));
    });
  }

  forecast(first: Day, last: Day): ForecastDate[] {
    if (last < first || last - first > MAX_FORECAST_DAYS) {
      throw new ValidationFailed(`The range must be 0 to ${String(MAX_FORECAST_DAYS)} days long.`);
    }
    const today = this.today();
    const limit = MAX_FORECAST_DAYS + 1;
    const found: ForecastDate[] = [];
    for (const todo of this.repos.todos.openRepeating()) {
      if (todo.rrule === null || todo.due_date === null || todo.recurrence_anchor === null)
        continue;
      const base = Math.max(dateDay(todo.due_date), today);
      const dates =
        todo.repeat_from === "completion"
          ? recurrence.steppedDates(todo.rrule, base, first, last, limit)
          : recurrence.seriesDates(
              todo.rrule,
              dateDay(todo.recurrence_anchor),
              base,
              first,
              last,
              limit,
            );
      for (const date of dates) found.push({ todoId: todo.id, date });
    }
    return found;
  }

  move(
    todoId: string,
    placement: Placement,
    beforeId: string | null,
    afterId: string | null,
  ): TodoRecord[] {
    return this.db.transaction(() => {
      const todo = live(this.repos.todos.get(todoId), "todo");
      if (todo.rrule !== null && placement.parentId !== null) {
        throw new ValidationFailed("A repeating todo cannot become a subtask.");
      }
      this.checkPlacement(placement, todo);
      const p = placement;
      const siblings = this.repos.todos.positions(p.listId, p.sectionId, p.parentId, todoId);
      const position = place(siblings, beforeId, afterId);
      const now = nowIso(this.clock);
      this.repos.todos.update(
        todoId,
        { list_id: p.listId, section_id: p.sectionId, parent_id: p.parentId, position },
        now,
      );
      const children = this.repos.todos.liveChildren(todoId);
      if (children.length > 0)
        this.repos.todos.setPlacementOfChildren(todoId, p.listId, p.sectionId, now);
      return this.records(this.repos.todos.getMany([todoId, ...children.map((c) => c.id)]));
    });
  }

  setTodayOrder(todoIds: readonly string[]): TodoRecord[] {
    if (new Set(todoIds).size !== todoIds.length) {
      throw new ValidationFailed("Each todo can appear only once in the order.");
    }
    return this.db.transaction(() => {
      const todos = new Map(this.repos.todos.getMany(todoIds).map((t) => [t.id, t]));
      const now = nowIso(this.clock);
      const changed: string[] = [];
      let key: string | null = null;
      for (const todoId of todoIds) {
        const todo = live(todos.get(todoId) ?? null, "todo");
        key = keyBetween(key, null);
        if (todo.today_position !== key) {
          this.repos.todos.update(todoId, { today_position: key }, now);
          changed.push(todoId);
        }
      }
      return this.records(this.repos.todos.getMany(changed));
    });
  }

  setRankOrder(
    todoIds: readonly string[],
    unranked: readonly string[],
    scope: "all" | "today",
  ): TodoRecord[] {
    const listed = [...todoIds, ...unranked];
    if (new Set(listed).size !== listed.length) {
      throw new ValidationFailed("Each todo can appear only once in the order.");
    }
    return this.db.transaction(() => {
      const todos = new Map(this.repos.todos.getMany(listed).map((t) => [t.id, t]));
      const now = nowIso(this.clock);
      const wanted: [string, string | null][] = [];
      let key: string | null = null;
      for (const todoId of todoIds) {
        key = keyBetween(key, null);
        wanted.push([todoId, key]);
      }
      for (const todoId of unranked) wanted.push([todoId, null]);
      const column = scope === "all" ? "rank_position" : "today_rank_position";
      const changed: string[] = [];
      for (const [todoId, rank] of wanted) {
        const todo = live(todos.get(todoId) ?? null, "todo");
        if (todo[column] !== rank) {
          this.repos.todos.update(todoId, { [column]: rank }, now);
          changed.push(todoId);
        }
      }
      return this.records(this.repos.todos.getMany(changed));
    });
  }

  delete(todoId: string): Deletion {
    return this.db.transaction(() => {
      live(this.repos.todos.get(todoId), "todo");
      const now = nowIso(this.clock);
      const children = this.repos.todos.liveIdsIn("parent_id", [todoId]);
      const count = this.repos.todos.setDeleted([todoId, ...children], now, now);
      return deletion(now, { todos: count });
    });
  }

  restore(todoId: string): TodoRecord[] {
    return this.db.transaction(() => {
      const [todo, stamp] = deleted(this.repos.todos.get(todoId), "todo");
      this.checkRestorable(todo);
      const children = this.repos.todos.idsDeletedWith("parent_id", [todoId], stamp);
      const siblings = this.repos.todos.positions(todo.list_id, todo.section_id, todo.parent_id);
      const now = nowIso(this.clock);
      this.repos.todos.setDeleted([todoId, ...children], null, now);
      this.repos.todos.update(todoId, { position: freePosition(siblings, todo.position) }, now);
      return this.records(this.repos.todos.getMany([todoId, ...children]));
    });
  }

  // ---- internals

  private checkPlacement(p: Placement, moving: Todo | null): void {
    const repos = this.repos;
    if (p.listId !== null) {
      const list = repos.lists.get(p.listId);
      if (list?.deleted_at !== null) throw new ValidationFailed("Unknown list.");
    }
    if (p.sectionId !== null) {
      if (p.listId === null) throw new ValidationFailed("The Inbox has no sections.");
      const section = repos.sections.get(p.sectionId);
      if (section?.deleted_at !== null || section.list_id !== p.listId) {
        throw new ValidationFailed("That section is not in this list.");
      }
    }
    if (p.parentId === null) return;
    const parent = repos.todos.get(p.parentId);
    if (parent?.deleted_at !== null) throw new ValidationFailed("Unknown parent todo.");
    if (moving !== null && parent.id === moving.id)
      throw new ValidationFailed("A todo cannot be its own subtask.");
    if (parent.parent_id !== null) throw new ValidationFailed("Subtasks cannot have subtasks.");
    if (parent.completed_at !== null) throw new ValidationFailed("Reopen the parent todo first.");
    if (parent.list_id !== p.listId || parent.section_id !== p.sectionId) {
      throw new ValidationFailed("A subtask must be in its parent's list and section.");
    }
    if (moving !== null && repos.todos.liveChildren(moving.id).length > 0) {
      throw new ValidationFailed("A todo with subtasks cannot become a subtask.");
    }
  }

  private checkRestorable(todo: Todo): void {
    const repos = this.repos;
    if (todo.list_id !== null) {
      const list = repos.lists.get(todo.list_id);
      if (list?.deleted_at !== null) {
        throw new Conflict("This todo's list is deleted. Restore the list first.");
      }
    }
    if (todo.section_id !== null) {
      const section = repos.sections.get(todo.section_id);
      if (section?.deleted_at !== null) {
        throw new Conflict("This todo's section is deleted. Restore the section first.");
      }
    }
    if (todo.parent_id !== null) {
      const parent = repos.todos.get(todo.parent_id);
      if (parent?.deleted_at !== null) {
        throw new Conflict("This subtask's parent is deleted. Restore the parent first.");
      }
    }
  }

  private today(): Day {
    return localDay(this.clock.now(), this.zone);
  }

  /** Today's group order always goes; Today's "My order" only when the todo leaves Today. */
  private redatedKeys(due: unknown): Fields {
    const keys: Fields = { today_position: null };
    if (typeof due !== "string" || due > isoDate(this.today())) keys.today_rank_position = null;
    return keys;
  }

  private normalizeRule(rule: string, anchor: Day): string {
    try {
      return recurrence.normalize(rule, recurrence.allDayAnchor(anchor, anchor), this.zone);
    } catch (error) {
      if (error instanceof recurrence.RecurrenceError) throw new ValidationFailed(error.message);
      throw error;
    }
  }

  private startSeries(rule: string, due: Day | null, repeatFrom: string): [string, Day] {
    let start = due;
    if (start === null) {
      const today = this.today();
      const first = recurrence.dateAfter(this.normalizeRule(rule, today), today, today - 1);
      start = first ?? today;
    }
    const text = this.normalizeRule(rule, start);
    if (repeatFrom === "completion" && !recurrence.isPlain(text)) {
      throw new ValidationFailed(
        "Only every N days, weeks, months or years can repeat from completion.",
      );
    }
    return [text, start];
  }

  private repeatFields(todo: Todo, changes: ReadonlyMap<string, unknown>): Fields {
    const stop: Fields = { rrule: null, recurrence_anchor: null, repeat_from: "due" };
    if (changes.has("due_date") && changes.get("due_date") === null) return stop;
    if (!changes.has("rrule") && (changes.get("repeat_from") ?? null) === null) return {};
    const value = changes.has("rrule") ? changes.get("rrule") : todo.rrule;
    if (value === null || value === undefined) return stop;
    const rule = pyStr(value);
    if (todo.parent_id !== null)
      throw new ValidationFailed("Subtasks cannot repeat; let their parent repeat.");
    const repeatFrom = cleanRepeatFrom(changes.get("repeat_from") ?? todo.repeat_from);
    if (!changes.has("rrule")) {
      if (repeatFrom === "completion" && !recurrence.isPlain(rule)) {
        throw new ValidationFailed(
          "Only every N days, weeks, months or years can repeat from completion.",
        );
      }
      return { repeat_from: repeatFrom };
    }
    const due = changes.get("due_date");
    let start: Day | null;
    if (typeof due === "string") start = dateDay(due);
    else if (todo.due_date !== null) start = dateDay(todo.due_date);
    else start = null;
    const [text, anchor] = this.startSeries(rule, start, repeatFrom);
    return {
      rrule: text,
      recurrence_anchor: isoDate(anchor),
      due_date: isoDate(anchor),
      repeat_from: repeatFrom,
    };
  }

  private insertNext(todo: Todo, children: readonly Todo[], now: string): string[] {
    if (todo.rrule === null || todo.due_date === null || todo.recurrence_anchor === null) return [];
    const due = dateDay(todo.due_date);
    let rule = todo.rrule;
    let anchor = todo.recurrence_anchor;
    let nextDue: Day;
    if (todo.repeat_from === "completion") {
      const stepped = recurrence.stepAfter(rule, this.today());
      if (stepped === null) return [];
      [nextDue, rule] = stepped;
      anchor = isoDate(nextDue);
    } else {
      const following = recurrence.dateAfter(rule, dateDay(anchor), Math.max(due, this.today()));
      if (following === null) return [];
      nextDue = following;
    }
    const siblings = this.repos.todos.positions(todo.list_id, todo.section_id, null);
    const successor: Todo = {
      ...todo,
      id: newId(),
      due_date: isoDate(nextDue),
      position: place(siblings, null, todo.id),
      completed_at: null,
      created_at: now,
      updated_at: now,
      recurs_from_id: todo.id,
      today_position: null,
      rrule: rule,
      recurrence_anchor: anchor,
    };
    this.repos.todos.insert(successor);
    this.copyTags(todo.id, successor.id);
    const shift = nextDue - due;
    const ids = [successor.id];
    for (const child of children) {
      const copy: Todo = {
        ...child,
        id: newId(),
        parent_id: successor.id,
        due_date: child.due_date === null ? null : isoDate(dateDay(child.due_date) + shift),
        completed_at: null,
        created_at: now,
        updated_at: now,
        today_position: null,
      };
      this.repos.todos.insert(copy);
      this.copyTags(child.id, copy.id);
      ids.push(copy.id);
    }
    return ids;
  }

  private withdrawNext(todo: Todo, now: string): void {
    for (const successor of this.repos.todos.liveSuccessors(todo.id)) {
      if (successor.completed_at === null) {
        const children = this.repos.todos.liveIdsIn("parent_id", [successor.id]);
        this.repos.todos.setDeleted([successor.id, ...children], now, now);
      } else if (todo.rrule !== null) {
        this.repos.todos.update(todo.id, { rrule: null, recurrence_anchor: null }, now);
      }
    }
  }

  private copyTags(fromId: string, toId: string): void {
    const tagIds = this.tags.tagsFor(ENTITY_TYPE, [fromId]).get(fromId) ?? [];
    if (tagIds.length > 0) this.tags.setTags({ entityType: ENTITY_TYPE, entityId: toId }, tagIds);
  }

  private record(todo: Todo): TodoRecord {
    return this.records([todo])[0] as TodoRecord;
  }

  private records(todos: readonly Todo[]): TodoRecord[] {
    const tags = this.tags.tagsFor(
      ENTITY_TYPE,
      todos.map((t) => t.id),
    );
    return todos.map((todo) => ({ todo, tagIds: tags.get(todo.id) ?? [] }));
  }
}

function parseCursor(cursor: string | null): [string, string] | null {
  if (cursor === null) return null;
  const bar = cursor.indexOf("|");
  const completedAt = bar < 0 ? "" : cursor.slice(0, bar);
  const todoId = bar < 0 ? "" : cursor.slice(bar + 1);
  if (!completedAt || !todoId) throw new ValidationFailed("Invalid logbook cursor.");
  return [completedAt, todoId];
}
