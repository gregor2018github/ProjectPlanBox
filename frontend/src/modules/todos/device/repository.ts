/**
 * SQL for the todos module on the device: the twin of
 * `backend/planbox/modules/todos/repository.py`. Repositories never commit.
 */
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
import type { Positions } from "../../../core/device/placement";

/** A group of lists, tinted by its hue. */
export interface Area {
  id: string;
  name: string;
  hue: number;
  position: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A list of todos, optionally inside an area. */
export interface TodoList {
  id: string;
  area_id: string | null;
  name: string;
  position: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A heading inside a list. */
export interface Section {
  id: string;
  list_id: string;
  name: string;
  position: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A todo or (with `parent_id`) a subtask. */
export interface Todo {
  id: string;
  list_id: string | null;
  section_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string;
  priority: number;
  due_date: string | null;
  position: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  rrule: string | null;
  recurrence_anchor: string | null;
  recurs_from_id: string | null;
  today_position: string | null;
  repeat_from: string;
  rank_position: string | null;
  today_rank_position: string | null;
}

/** A writable field and its new value. */
export type Fields = Record<string, Value>;

const AREA = "id, name, hue, position, created_at, updated_at, deleted_at";
const LIST = "id, area_id, name, position, created_at, updated_at, deleted_at";
const SECTION = "id, list_id, name, position, created_at, updated_at, deleted_at";
const TODO =
  "id, list_id, section_id, parent_id, title, notes, priority, due_date, position, " +
  "completed_at, created_at, updated_at, deleted_at, rrule, recurrence_anchor, recurs_from_id, " +
  "today_position, repeat_from, rank_position, today_rank_position";
const TODO_EDITABLE = new Set([
  "title",
  "notes",
  "priority",
  "due_date",
  "list_id",
  "section_id",
  "parent_id",
  "position",
  "rrule",
  "recurrence_anchor",
  "today_position",
  "repeat_from",
  "rank_position",
  "today_rank_position",
]);

function areaOf(r: Row): Area {
  return {
    id: text(r, "id"),
    name: text(r, "name"),
    hue: int(r, "hue"),
    position: text(r, "position"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

function listOf(r: Row): TodoList {
  return {
    id: text(r, "id"),
    area_id: textOrNull(r, "area_id"),
    name: text(r, "name"),
    position: text(r, "position"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

function sectionOf(r: Row): Section {
  return {
    id: text(r, "id"),
    list_id: text(r, "list_id"),
    name: text(r, "name"),
    position: text(r, "position"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

function todoOf(r: Row): Todo {
  return {
    id: text(r, "id"),
    list_id: textOrNull(r, "list_id"),
    section_id: textOrNull(r, "section_id"),
    parent_id: textOrNull(r, "parent_id"),
    title: text(r, "title"),
    notes: text(r, "notes"),
    priority: int(r, "priority"),
    due_date: textOrNull(r, "due_date"),
    position: text(r, "position"),
    completed_at: textOrNull(r, "completed_at"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
    rrule: textOrNull(r, "rrule"),
    recurrence_anchor: textOrNull(r, "recurrence_anchor"),
    recurs_from_id: textOrNull(r, "recurs_from_id"),
    today_position: textOrNull(r, "today_position"),
    repeat_from: text(r, "repeat_from"),
    rank_position: textOrNull(r, "rank_position"),
    today_rank_position: textOrNull(r, "today_rank_position"),
  };
}

function positionsOf(rows: Row[]): Positions {
  return rows.map((r) => [text(r, "id"), text(r, "position")]);
}

function update(
  db: Database,
  table: string,
  id: string,
  fields: Fields,
  allowed: ReadonlySet<string>,
  now: string,
): void {
  const names = Object.keys(fields);
  const unknown = names.filter((n) => !allowed.has(n));
  if (unknown.length > 0) throw new Error(`cannot update ${unknown.join(", ")} on ${table}`);
  if (names.length === 0) return;
  const assignments = names.map((n) => `${n} = :${n}`).join(", ");
  db.run(`UPDATE ${table} SET ${assignments}, updated_at = :updated_at WHERE id = :id`, {
    ...fields,
    updated_at: now,
    id,
  });
}

function setDeleted(
  db: Database,
  table: string,
  ids: readonly string[],
  deletedAt: string | null,
  now: string,
): number {
  let changed = 0;
  for (const chunk of chunks(ids)) {
    changed += db.run(
      `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id IN (${marks(chunk)})`,
      [deletedAt, now, ...chunk],
    );
  }
  return changed;
}

function idsWhere(
  db: Database,
  table: string,
  column: string,
  values: readonly string[],
  deletedAt: string | null,
): string[] {
  const ids: string[] = [];
  for (const chunk of chunks(values)) {
    for (const row of db.all(
      `SELECT id FROM ${table} WHERE deleted_at IS ? AND ${column} IN (${marks(chunk)})`,
      [deletedAt, ...chunk],
    )) {
      ids.push(text(row, "id"));
    }
  }
  return ids;
}

/** `todos_areas`. */
export class AreaRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Area | null {
    const row = this.db.get(`SELECT ${AREA} FROM todos_areas WHERE id = ?`, [id]);
    return row === undefined ? null : areaOf(row);
  }

  listLive(): Area[] {
    return this.db
      .all(`SELECT ${AREA} FROM todos_areas WHERE deleted_at IS NULL ORDER BY position, id`)
      .map(areaOf);
  }

  positions(excludeId: string | null = null): Positions {
    return positionsOf(
      this.db.all(
        "SELECT id, position FROM todos_areas WHERE deleted_at IS NULL AND id IS NOT ? ORDER BY position, id",
        [excludeId],
      ),
    );
  }

  insert(area: Area): void {
    this.db.run(
      `INSERT INTO todos_areas (${AREA}) VALUES (:id, :name, :hue, :position, :created_at, :updated_at, :deleted_at)`,
      { ...area },
    );
  }

  update(id: string, fields: Fields, now: string): void {
    update(this.db, "todos_areas", id, fields, new Set(["name", "hue", "position"]), now);
  }

  setDeleted(id: string, deletedAt: string | null, now: string): void {
    this.db.run("UPDATE todos_areas SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      deletedAt,
      now,
      id,
    ]);
  }
}

/** `todos_lists`. */
export class ListRepository {
  constructor(private readonly db: Database) {}

  get(id: string): TodoList | null {
    const row = this.db.get(`SELECT ${LIST} FROM todos_lists WHERE id = ?`, [id]);
    return row === undefined ? null : listOf(row);
  }

  listLive(): TodoList[] {
    return this.db
      .all(
        `SELECT ${LIST} FROM todos_lists WHERE deleted_at IS NULL ` +
          "ORDER BY area_id IS NOT NULL, area_id, position, id",
      )
      .map(listOf);
  }

  positions(areaId: string | null, excludeId: string | null = null): Positions {
    return positionsOf(
      this.db.all(
        "SELECT id, position FROM todos_lists " +
          "WHERE deleted_at IS NULL AND area_id IS ? AND id IS NOT ? ORDER BY position, id",
        [areaId, excludeId],
      ),
    );
  }

  liveIdsInArea(areaId: string): string[] {
    return this.db
      .all("SELECT id FROM todos_lists WHERE deleted_at IS NULL AND area_id = ?", [areaId])
      .map((r) => text(r, "id"));
  }

  idsDeletedWith(areaId: string, deletedAt: string): string[] {
    return this.db
      .all("SELECT id FROM todos_lists WHERE area_id = ? AND deleted_at = ?", [areaId, deletedAt])
      .map((r) => text(r, "id"));
  }

  insert(list: TodoList): void {
    this.db.run(
      `INSERT INTO todos_lists (${LIST}) VALUES (:id, :area_id, :name, :position, :created_at, :updated_at, :deleted_at)`,
      { ...list },
    );
  }

  update(id: string, fields: Fields, now: string): void {
    update(this.db, "todos_lists", id, fields, new Set(["name", "area_id", "position"]), now);
  }

  setDeleted(ids: readonly string[], deletedAt: string | null, now: string): number {
    return setDeleted(this.db, "todos_lists", ids, deletedAt, now);
  }
}

/** `todos_sections`. */
export class SectionRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Section | null {
    const row = this.db.get(`SELECT ${SECTION} FROM todos_sections WHERE id = ?`, [id]);
    return row === undefined ? null : sectionOf(row);
  }

  listLive(): Section[] {
    return this.db
      .all(
        `SELECT ${SECTION} FROM todos_sections WHERE deleted_at IS NULL ORDER BY list_id, position, id`,
      )
      .map(sectionOf);
  }

  positions(listId: string, excludeId: string | null = null): Positions {
    return positionsOf(
      this.db.all(
        "SELECT id, position FROM todos_sections " +
          "WHERE deleted_at IS NULL AND list_id = ? AND id IS NOT ? ORDER BY position, id",
        [listId, excludeId],
      ),
    );
  }

  liveIdsInLists(listIds: readonly string[]): string[] {
    return idsWhere(this.db, "todos_sections", "list_id", listIds, null);
  }

  idsDeletedWith(listIds: readonly string[], deletedAt: string): string[] {
    return idsWhere(this.db, "todos_sections", "list_id", listIds, deletedAt);
  }

  insert(section: Section): void {
    this.db.run(
      `INSERT INTO todos_sections (${SECTION}) VALUES (:id, :list_id, :name, :position, :created_at, :updated_at, :deleted_at)`,
      { ...section },
    );
  }

  update(id: string, fields: Fields, now: string): void {
    update(this.db, "todos_sections", id, fields, new Set(["name", "list_id", "position"]), now);
  }

  setDeleted(ids: readonly string[], deletedAt: string | null, now: string): number {
    return setDeleted(this.db, "todos_sections", ids, deletedAt, now);
  }
}

/** Which column a todo scope uses. */
export type TodoScope = "list_id" | "section_id" | "parent_id";

/** `todos`. */
export class TodoRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Todo | null {
    const row = this.db.get(`SELECT ${TODO} FROM todos WHERE id = ?`, [id]);
    return row === undefined ? null : todoOf(row);
  }

  getMany(ids: readonly string[]): Todo[] {
    const result: Todo[] = [];
    for (const chunk of chunks(ids)) {
      result.push(
        ...this.db
          .all(`SELECT ${TODO} FROM todos WHERE id IN (${marks(chunk)})`, chunk)
          .map(todoOf),
      );
    }
    return result;
  }

  listCurrent(completedSince: string): Todo[] {
    return this.db
      .all(
        `SELECT ${TODO} FROM todos WHERE deleted_at IS NULL ` +
          "AND (completed_at IS NULL OR completed_at >= ?) ORDER BY position, id",
        [completedSince],
      )
      .map(todoOf);
  }

  listAll(): Todo[] {
    return this.db.all(`SELECT ${TODO} FROM todos ORDER BY id`).map(todoOf);
  }

  listCompleted(before: [string, string] | null, limit: number): Todo[] {
    if (before === null) {
      return this.db
        .all(
          `SELECT ${TODO} FROM todos WHERE deleted_at IS NULL ` +
            "AND completed_at IS NOT NULL ORDER BY completed_at DESC, id DESC LIMIT ?",
          [limit],
        )
        .map(todoOf);
    }
    return this.db
      .all(
        `SELECT ${TODO} FROM todos WHERE deleted_at IS NULL AND completed_at IS NOT NULL ` +
          "AND (completed_at < ? OR (completed_at = ? AND id < ?)) " +
          "ORDER BY completed_at DESC, id DESC LIMIT ?",
        [before[0], before[0], before[1], limit],
      )
      .map(todoOf);
  }

  positions(
    listId: string | null,
    sectionId: string | null,
    parentId: string | null,
    excludeId: string | null = null,
  ): Positions {
    return positionsOf(
      this.db.all(
        "SELECT id, position FROM todos WHERE deleted_at IS NULL " +
          "AND list_id IS ? AND section_id IS ? AND parent_id IS ? AND id IS NOT ? ORDER BY position, id",
        [listId, sectionId, parentId, excludeId],
      ),
    );
  }

  liveChildren(parentId: string): Todo[] {
    return this.db
      .all(
        `SELECT ${TODO} FROM todos WHERE deleted_at IS NULL AND parent_id = ? ORDER BY position, id`,
        [parentId],
      )
      .map(todoOf);
  }

  liveSuccessors(todoId: string): Todo[] {
    return this.db
      .all(`SELECT ${TODO} FROM todos WHERE deleted_at IS NULL AND recurs_from_id = ?`, [todoId])
      .map(todoOf);
  }

  openRepeating(): Todo[] {
    return this.db
      .all(
        `SELECT ${TODO} FROM todos WHERE deleted_at IS NULL ` +
          "AND completed_at IS NULL AND rrule IS NOT NULL ORDER BY position, id",
      )
      .map(todoOf);
  }

  liveIdsIn(column: TodoScope, values: readonly string[]): string[] {
    return idsWhere(this.db, "todos", column, values, null);
  }

  idsDeletedWith(column: TodoScope, values: readonly string[], deletedAt: string): string[] {
    return idsWhere(this.db, "todos", column, values, deletedAt);
  }

  insert(todo: Todo): void {
    this.db.run(
      `INSERT INTO todos (${TODO}) VALUES (` +
        ":id, :list_id, :section_id, :parent_id, :title, :notes, :priority, :due_date, " +
        ":position, :completed_at, :created_at, :updated_at, :deleted_at, " +
        ":rrule, :recurrence_anchor, :recurs_from_id, :today_position, " +
        ":repeat_from, :rank_position, :today_rank_position)",
      { ...todo },
    );
  }

  update(id: string, fields: Fields, now: string): void {
    update(this.db, "todos", id, fields, TODO_EDITABLE, now);
  }

  setPlacementOfChildren(
    parentId: string,
    listId: string | null,
    sectionId: string | null,
    now: string,
  ): void {
    this.db.run(
      "UPDATE todos SET list_id = ?, section_id = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL",
      [listId, sectionId, now, parentId],
    );
  }

  setListOfSection(sectionId: string, listId: string, now: string): void {
    this.db.run(
      "UPDATE todos SET list_id = ?, updated_at = ? WHERE section_id = ? AND deleted_at IS NULL",
      [listId, now, sectionId],
    );
  }

  setCompleted(ids: readonly string[], completedAt: string | null, now: string): void {
    for (const chunk of chunks(ids)) {
      this.db.run(
        `UPDATE todos SET completed_at = ?, updated_at = ? WHERE id IN (${marks(chunk)})`,
        [completedAt, now, ...chunk],
      );
    }
  }

  setDeleted(ids: readonly string[], deletedAt: string | null, now: string): number {
    return setDeleted(this.db, "todos", ids, deletedAt, now);
  }
}

/** Title, deleted flag and hint per todo id (for core tags/links/search). */
export function summarizeTodos(
  db: Database,
  ids: readonly string[],
): Map<string, [string, boolean, string]> {
  const result = new Map<string, [string, boolean, string]>();
  for (const chunk of chunks(ids)) {
    const rows = db.all(
      "SELECT t.id, t.title, t.deleted_at, t.completed_at, l.name AS list_name " +
        `FROM todos t LEFT JOIN todos_lists l ON l.id = t.list_id WHERE t.id IN (${marks(chunk)})`,
      chunk,
    );
    for (const r of rows) {
      const place = r.list_name === null ? "Inbox" : String(r.list_name);
      const hint = r.completed_at === null ? place : `Done · ${place}`;
      result.set(text(r, "id"), [text(r, "title"), r.deleted_at !== null, hint]);
    }
  }
  return result;
}

/** `(id, title, notes, deleted, updated_at)` of todos changed at or after `since`. */
export function todoSearchRows(
  db: Database,
  since: string | null,
): [string, string, string, boolean, string][] {
  return db
    .all(
      "SELECT id, title, notes, deleted_at, updated_at FROM todos WHERE :since IS NULL OR updated_at >= :since",
      {
        since,
      },
    )
    .map((r) => [
      text(r, "id"),
      text(r, "title"),
      text(r, "notes"),
      r.deleted_at !== null,
      text(r, "updated_at"),
    ]);
}

/** `(created_at, completed_at, deleted_at, spawned)` of todos touched at/after `since`. */
export function todoActivityRows(
  db: Database,
  since: string,
): [string, string | null, string | null, boolean][] {
  return db
    .all(
      "SELECT created_at, completed_at, deleted_at, recurs_from_id FROM todos " +
        "WHERE created_at >= :since OR completed_at >= :since OR deleted_at >= :since",
      { since },
    )
    .map((r) => [
      text(r, "created_at"),
      textOrNull(r, "completed_at"),
      textOrNull(r, "deleted_at"),
      r.recurs_from_id !== null,
    ]);
}
