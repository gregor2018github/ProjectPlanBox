/**
 * The knowledge module on the device: the twin of
 * `backend/planbox/modules/knowledge/` (repository, service, router).
 */
import { newId } from "../../../core/ids";
import { nowIso, type Clock } from "../../../core/device/clock";
import { changesOf, checkClientId, oneLine, pyStr } from "../../../core/device/common";
import {
  chunks,
  marks,
  text,
  textOrNull,
  type Database,
  type Row,
  type Value,
} from "../../../core/device/db";
import { lifecycleEvents } from "../../../core/device/entities";
import { Conflict, NotFound, textLength, ValidationFailed } from "../../../core/device/errors";
import { freePosition, place, type Positions } from "../../../core/device/placement";
import {
  Answer,
  type DeviceContext,
  type DeviceModule,
  type Handlers,
} from "../../../core/device/server";
import { TagService } from "../../../core/device/tags";
import { pageText } from "../pageText";
import { checkContent, serializeContent, type DeviceContent } from "./content";

const ENTITY_TYPE = "knowledge.entry";
const MAX_NAME = 200;
const MAX_TITLE = 500;
const EMPTY_CONTENT: DeviceContent = { boxes: [] };

interface Collection {
  id: string;
  name: string;
  position: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface Entry {
  id: string;
  collection_id: string | null;
  title: string;
  /** The page's JSON as stored. */
  content: string;
  /** Its plain text, derived on every write. */
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface Deletion {
  deleted_at: string;
  collections: number;
  entries: number;
}

const COLLECTION = "id, name, position, created_at, updated_at, deleted_at";
const ENTRY = "id, collection_id, title, content, body, created_at, updated_at, deleted_at";
const ENTRY_EDITABLE = new Set(["collection_id", "title", "content", "body"]);

function collectionOf(r: Row): Collection {
  return {
    id: text(r, "id"),
    name: text(r, "name"),
    position: text(r, "position"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

function entryOf(r: Row): Entry {
  return {
    id: text(r, "id"),
    collection_id: textOrNull(r, "collection_id"),
    title: text(r, "title"),
    content: text(r, "content"),
    body: text(r, "body"),
    created_at: text(r, "created_at"),
    updated_at: text(r, "updated_at"),
    deleted_at: textOrNull(r, "deleted_at"),
  };
}

// ------------------------------------------------------------------ repository

class CollectionRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Collection | null {
    const row = this.db.get(`SELECT ${COLLECTION} FROM knowledge_collections WHERE id = ?`, [id]);
    return row === undefined ? null : collectionOf(row);
  }

  listLive(): Collection[] {
    return this.db
      .all(
        `SELECT ${COLLECTION} FROM knowledge_collections WHERE deleted_at IS NULL ORDER BY position, id`,
      )
      .map(collectionOf);
  }

  positions(excludeId: string | null = null): Positions {
    return this.db
      .all(
        "SELECT id, position FROM knowledge_collections WHERE deleted_at IS NULL AND id IS NOT ? ORDER BY position, id",
        [excludeId],
      )
      .map((r) => [text(r, "id"), text(r, "position")]);
  }

  insert(c: Collection): void {
    this.db.run(
      `INSERT INTO knowledge_collections (${COLLECTION}) VALUES (:id, :name, :position, :created_at, :updated_at, :deleted_at)`,
      { ...c },
    );
  }

  update(id: string, fields: Record<string, Value>, now: string): void {
    const names = Object.keys(fields);
    if (names.some((n) => n !== "name" && n !== "position"))
      throw new Error("cannot update that on collections");
    if (names.length === 0) return;
    this.db.run(
      `UPDATE knowledge_collections SET ${names.map((n) => `${n} = :${n}`).join(", ")}, updated_at = :updated_at WHERE id = :id`,
      { ...fields, updated_at: now, id },
    );
  }

  setDeleted(id: string, deletedAt: string | null, now: string): void {
    this.db.run("UPDATE knowledge_collections SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      deletedAt,
      now,
      id,
    ]);
  }
}

class EntryRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Entry | null {
    const row = this.db.get(`SELECT ${ENTRY} FROM knowledge_entries WHERE id = ?`, [id]);
    return row === undefined ? null : entryOf(row);
  }

  listLive(): Entry[] {
    return this.db
      .all(
        `SELECT ${ENTRY} FROM knowledge_entries WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC`,
      )
      .map(entryOf);
  }

  liveIdsIn(collectionId: string): string[] {
    return this.db
      .all("SELECT id FROM knowledge_entries WHERE deleted_at IS NULL AND collection_id = ?", [
        collectionId,
      ])
      .map((r) => text(r, "id"));
  }

  idsDeletedWith(collectionId: string, deletedAt: string): string[] {
    return this.db
      .all("SELECT id FROM knowledge_entries WHERE collection_id = ? AND deleted_at = ?", [
        collectionId,
        deletedAt,
      ])
      .map((r) => text(r, "id"));
  }

  insert(e: Entry): void {
    this.db.run(
      `INSERT INTO knowledge_entries (${ENTRY}) VALUES ` +
        "(:id, :collection_id, :title, :content, :body, :created_at, :updated_at, :deleted_at)",
      { ...e },
    );
  }

  update(id: string, fields: Record<string, Value>, now: string): void {
    const names = Object.keys(fields);
    if (names.some((n) => !ENTRY_EDITABLE.has(n))) throw new Error("cannot update that on entries");
    if (names.length === 0) return;
    this.db.run(
      `UPDATE knowledge_entries SET ${names.map((n) => `${n} = :${n}`).join(", ")}, updated_at = :updated_at WHERE id = :id`,
      { ...fields, updated_at: now, id },
    );
  }

  touch(id: string, now: string): void {
    this.db.run("UPDATE knowledge_entries SET updated_at = ? WHERE id = ?", [now, id]);
  }

  setDeleted(ids: readonly string[], deletedAt: string | null, now: string): number {
    let changed = 0;
    for (const chunk of chunks(ids)) {
      changed += this.db.run(
        `UPDATE knowledge_entries SET deleted_at = ?, updated_at = ? WHERE id IN (${marks(chunk)})`,
        [deletedAt, now, ...chunk],
      );
    }
    return changed;
  }
}

// ---------------------------------------------------------------- service

function capitalize(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function cleanOneLine(value: string, what: string, limit: number): string {
  const cleaned = oneLine(value);
  if (!cleaned) throw new ValidationFailed(`A ${what} cannot be empty.`);
  if (textLength(cleaned) > limit)
    throw new ValidationFailed(`${capitalize(what)}s are at most ${String(limit)} characters.`);
  return cleaned;
}

/** Checks a page's content; returns it serialized and its plain text. */
function cleanContent(content: DeviceContent): [string, string] {
  checkContent(content);
  return [serializeContent(content), pageText(content)];
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

class CollectionService {
  private readonly collections: CollectionRepository;
  private readonly entries: EntryRepository;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    this.collections = new CollectionRepository(db);
    this.entries = new EntryRepository(db);
  }

  listLive(): Collection[] {
    return this.collections.listLive();
  }

  create(name: string, id: string | null): [Collection, boolean] {
    checkClientId(id);
    const cleaned = cleanOneLine(name, "name", MAX_NAME);
    return this.db.transaction(() => {
      if (id !== null) {
        const existing = this.collections.get(id);
        if (existing !== null) return [existing, false];
      }
      const now = nowIso(this.clock);
      const c: Collection = {
        id: id ?? newId(),
        name: cleaned,
        position: place(this.collections.positions(), null, null),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.collections.insert(c);
      return [c, true];
    });
  }

  rename(id: string, name: string): Collection {
    const cleaned = cleanOneLine(name, "name", MAX_NAME);
    return this.db.transaction(() => {
      live(this.collections.get(id), "collection");
      this.collections.update(id, { name: cleaned }, nowIso(this.clock));
      return live(this.collections.get(id), "collection");
    });
  }

  move(id: string, beforeId: string | null, afterId: string | null): Collection {
    return this.db.transaction(() => {
      live(this.collections.get(id), "collection");
      const position = place(this.collections.positions(id), beforeId, afterId);
      this.collections.update(id, { position }, nowIso(this.clock));
      return live(this.collections.get(id), "collection");
    });
  }

  delete(id: string): Deletion {
    return this.db.transaction(() => {
      live(this.collections.get(id), "collection");
      const now = nowIso(this.clock);
      const entries = this.entries.setDeleted(this.entries.liveIdsIn(id), now, now);
      this.collections.setDeleted(id, now, now);
      return { deleted_at: now, collections: 1, entries };
    });
  }

  restore(id: string): Deletion {
    return this.db.transaction(() => {
      const [c, stamp] = deleted(this.collections.get(id), "collection");
      const now = nowIso(this.clock);
      const entryIds = this.entries.idsDeletedWith(id, stamp);
      const position = freePosition(this.collections.positions(), c.position);
      this.collections.setDeleted(id, null, now);
      this.collections.update(id, { position }, now);
      const entries = this.entries.setDeleted(entryIds, null, now);
      return { deleted_at: stamp, collections: 1, entries };
    });
  }
}

interface EntryRecord {
  entry: Entry;
  tagIds: string[];
}

interface NewEntry {
  title: string;
  id: string | null;
  collectionId: string | null;
  content: DeviceContent;
  tagIds: readonly string[];
}

class EntryService {
  private readonly collections: CollectionRepository;
  private readonly entries: EntryRepository;
  private readonly tags: TagService;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    this.collections = new CollectionRepository(db);
    this.entries = new EntryRepository(db);
    this.tags = new TagService(db, clock);
  }

  listLive(): EntryRecord[] {
    const entries = this.entries.listLive();
    const tags = this.tags.tagsFor(
      ENTITY_TYPE,
      entries.map((e) => e.id),
    );
    return entries.map((entry) => ({ entry, tagIds: tags.get(entry.id) ?? [] }));
  }

  create(input: NewEntry): [EntryRecord, boolean] {
    checkClientId(input.id);
    const title = cleanOneLine(input.title, "title", MAX_TITLE);
    const [content, body] = cleanContent(input.content);
    return this.db.transaction(() => {
      if (input.id !== null) {
        const existing = this.entries.get(input.id);
        if (existing !== null) return [this.record(existing), false];
      }
      this.checkCollection(input.collectionId);
      const now = nowIso(this.clock);
      const entry: Entry = {
        id: input.id ?? newId(),
        collection_id: input.collectionId,
        title,
        content,
        body,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.entries.insert(entry);
      if (input.tagIds.length > 0)
        this.tags.setTags({ entityType: ENTITY_TYPE, entityId: entry.id }, input.tagIds);
      return [this.record(entry), true];
    });
  }

  update(id: string, changes: ReadonlyMap<string, unknown>): EntryRecord {
    return this.db.transaction(() => {
      live(this.entries.get(id), "entry");
      const fields = this.cleanChanges(changes);
      const now = nowIso(this.clock);
      this.entries.update(id, fields, now);
      if (changes.has("tag_ids")) {
        const tagIds = changes.get("tag_ids");
        if (!Array.isArray(tagIds)) throw new ValidationFailed("tag_ids must be a list.");
        this.tags.setTags({ entityType: ENTITY_TYPE, entityId: id }, tagIds.map(String));
        this.entries.touch(id, now);
      }
      return this.record(live(this.entries.get(id), "entry"));
    });
  }

  delete(id: string): Deletion {
    return this.db.transaction(() => {
      live(this.entries.get(id), "entry");
      const now = nowIso(this.clock);
      this.entries.setDeleted([id], now, now);
      return { deleted_at: now, collections: 0, entries: 1 };
    });
  }

  restore(id: string): EntryRecord {
    return this.db.transaction(() => {
      const [entry] = deleted(this.entries.get(id), "entry");
      if (entry.collection_id !== null) {
        const c = this.collections.get(entry.collection_id);
        if (c?.deleted_at !== null) {
          throw new Conflict("This entry's collection is deleted. Restore it first.");
        }
      }
      this.entries.setDeleted([id], null, nowIso(this.clock));
      return this.record(live(this.entries.get(id), "entry"));
    });
  }

  private cleanChanges(changes: ReadonlyMap<string, unknown>): Record<string, Value> {
    const fields: Record<string, Value> = {};
    for (const [name, value] of changes) {
      if (name === "title") fields.title = cleanOneLine(pyStr(value), "title", MAX_TITLE);
      else if (name === "content") {
        if (value === null || value === undefined) {
          throw new ValidationFailed("A page's content cannot be cleared.");
        }
        [fields.content, fields.body] = cleanContent(value as DeviceContent);
      } else if (name === "collection_id") {
        const collectionId = value === null || value === undefined ? null : pyStr(value);
        this.checkCollection(collectionId);
        fields.collection_id = collectionId;
      } else if (name !== "tag_ids") {
        throw new ValidationFailed(`${name} cannot be changed.`);
      }
    }
    return fields;
  }

  private checkCollection(id: string | null): void {
    if (id === null) return;
    const c = this.collections.get(id);
    if (c?.deleted_at !== null) throw new ValidationFailed("Unknown collection.");
  }

  private record(entry: Entry): EntryRecord {
    return { entry, tagIds: this.tags.tagsFor(ENTITY_TYPE, [entry.id]).get(entry.id) ?? [] };
  }
}

// ------------------------------------------------------------------ routes

function collectionOut(c: Collection) {
  return {
    id: c.id,
    name: c.name,
    position: c.position,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function entryOut({ entry: e, tagIds }: EntryRecord) {
  return {
    id: e.id,
    collection_id: e.collection_id,
    title: e.title,
    content: JSON.parse(e.content) as DeviceContent,
    body: e.body,
    created_at: e.created_at,
    updated_at: e.updated_at,
    tag_ids: tagIds,
  };
}

const collections = (ctx: DeviceContext) => new CollectionService(ctx.db, ctx.clock);
const entries = (ctx: DeviceContext) => new EntryService(ctx.db, ctx.clock);

const handlers: Handlers = {
  knowledge_list_collections: (_, ctx) => collections(ctx).listLive().map(collectionOut),
  knowledge_create_collection: ({ body }, ctx) => {
    const [c, isNew] = collections(ctx).create(body.name, body.id ?? null);
    return isNew ? collectionOut(c) : new Answer(collectionOut(c), 200);
  },
  knowledge_rename_collection: ({ path, body }, ctx) =>
    collectionOut(collections(ctx).rename(path.collection_id, body.name)),
  knowledge_move_collection: ({ path, body }, ctx) =>
    collectionOut(
      collections(ctx).move(path.collection_id, body.before_id ?? null, body.after_id ?? null),
    ),
  knowledge_delete_collection: ({ path }, ctx) => collections(ctx).delete(path.collection_id),
  knowledge_restore_collection: ({ path }, ctx) => collections(ctx).restore(path.collection_id),
  knowledge_list_entries: (_, ctx) => entries(ctx).listLive().map(entryOut),
  knowledge_create_entry: ({ body }, ctx) => {
    const [record, isNew] = entries(ctx).create({
      id: body.id ?? null,
      collectionId: body.collection_id ?? null,
      title: body.title,
      content: body.content ?? EMPTY_CONTENT,
      tagIds: body.tag_ids ?? [],
    });
    return isNew ? entryOut(record) : new Answer(entryOut(record), 200);
  },
  knowledge_update_entry: ({ path, body, fields }, ctx) =>
    entryOut(entries(ctx).update(path.entry_id, changesOf(body, fields))),
  knowledge_delete_entry: ({ path }, ctx) => entries(ctx).delete(path.entry_id),
  knowledge_restore_entry: ({ path }, ctx) => entryOut(entries(ctx).restore(path.entry_id)),
  // Images stay on the PC that saved them (they do not sync); the phone app
  // cannot add any yet.
  knowledge_upload_image: () => {
    throw new Conflict(
      "Images can be added in PlanBox on a PC; the phone app cannot add them yet.",
    );
  },
};

/** Collections of pages. */
export const knowledgeDevice: DeviceModule = {
  id: "knowledge",
  migrations: {
    owner: "knowledge",
    files: import.meta.glob<string>(
      "../../../../../backend/planbox/modules/knowledge/migrations/*.sql",
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
          const rows = db.all(
            "SELECT e.id, e.title, e.deleted_at, c.name AS collection_name FROM knowledge_entries e " +
              `LEFT JOIN knowledge_collections c ON c.id = e.collection_id WHERE e.id IN (${marks(chunk)})`,
            chunk,
          );
          for (const r of rows) {
            const place = r.collection_name === null ? "Unsorted" : String(r.collection_name);
            const hint = `Page · ${place}`;
            result.set(text(r, "id"), {
              title: text(r, "title"),
              deleted: r.deleted_at !== null,
              hint,
            });
          }
        }
        return result;
      },
      documents: (db, since) =>
        db
          .all(
            "SELECT id, title, body, deleted_at, updated_at FROM knowledge_entries " +
              "WHERE :since IS NULL OR updated_at >= :since",
            { since },
          )
          .map((r) => ({
            id: text(r, "id"),
            title: text(r, "title"),
            body: text(r, "body"),
            deleted: r.deleted_at !== null,
            updatedAt: text(r, "updated_at"),
          })),
      activity: (db, window) =>
        lifecycleEvents(
          db
            .all(
              "SELECT created_at, deleted_at FROM knowledge_entries WHERE created_at >= :since OR deleted_at >= :since",
              { since: window.since },
            )
            .map(
              (r) =>
                [text(r, "created_at"), textOrNull(r, "deleted_at")] as [string, string | null],
            ),
        ),
    },
  ],
  handlers,
};
