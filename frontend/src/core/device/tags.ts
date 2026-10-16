/** Tags on the device: the twin of `backend/planbox/core/tags/`. */
import { newId } from "../ids";
import { nowIso, type Clock } from "./clock";
import { checkClientId, unique } from "./common";
import { chunks, marks, text, textOrNull, type Database, type Row } from "./db";
import type { EntityRef } from "./entities";
import { Conflict, NotFound, textLength, ValidationFailed } from "./errors";
import { Answer, type Handlers } from "./server";

const MAX_NAME_LENGTH = 64;
const FORBIDDEN = /[\s#@]/u;
const COLUMNS = "id, name, created_at, updated_at, deleted_at";

/** A live or deleted tag. */
export interface Tag {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function tagOf(row: Row): Tag {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    created_at: text(row, "created_at"),
    updated_at: text(row, "updated_at"),
    deleted_at: textOrNull(row, "deleted_at"),
  };
}

/** Trims a tag name and checks it (single words without `#` or `@`). */
export function normalizeTagName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) throw new ValidationFailed("A tag needs a name.");
  if (textLength(cleaned) > MAX_NAME_LENGTH) {
    throw new ValidationFailed(`Tag names are at most ${String(MAX_NAME_LENGTH)} characters.`);
  }
  if (FORBIDDEN.test(cleaned))
    throw new ValidationFailed("Tag names are single words without spaces, # or @.");
  return cleaned;
}

/** SQL for `core_tags` and `core_taggings`. */
export class TagRepository {
  constructor(private readonly db: Database) {}

  /** Live tags, alphabetically (case-insensitive). */
  listLive(): Tag[] {
    return this.db
      .all(
        `SELECT ${COLUMNS} FROM core_tags WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id`,
      )
      .map(tagOf);
  }

  /** A tag by id, live or deleted. */
  get(id: string): Tag | null {
    const row = this.db.get(`SELECT ${COLUMNS} FROM core_tags WHERE id = :id`, { id });
    return row === undefined ? null : tagOf(row);
  }

  /** The live tag with this name, ignoring case. */
  findLiveByName(name: string): Tag | null {
    const row = this.db.get(
      `SELECT ${COLUMNS} FROM core_tags WHERE deleted_at IS NULL AND lower(name) = lower(:name)`,
      { name },
    );
    return row === undefined ? null : tagOf(row);
  }

  /** The subset of `ids` that are live tags. */
  liveIds(ids: readonly string[]): Set<string> {
    if (ids.length === 0) return new Set();
    return new Set(
      this.db
        .all(`SELECT id FROM core_tags WHERE deleted_at IS NULL AND id IN (${marks(ids)})`, ids)
        .map((r) => text(r, "id")),
    );
  }

  /** Inserts a tag. */
  insert(tag: Tag): void {
    this.db.run(
      "INSERT INTO core_tags (id, name, created_at, updated_at, deleted_at) " +
        "VALUES (:id, :name, :created_at, :updated_at, :deleted_at)",
      { ...tag },
    );
  }

  /** Renames a tag. */
  rename(id: string, name: string, now: string): void {
    this.db.run("UPDATE core_tags SET name = :name, updated_at = :now WHERE id = :id", {
      id,
      name,
      now,
    });
  }

  /** Deletes a tag and its live taggings with one stamp. */
  softDelete(id: string, now: string): void {
    this.db.run("UPDATE core_tags SET deleted_at = :now, updated_at = :now WHERE id = :id", {
      id,
      now,
    });
    this.db.run(
      "UPDATE core_taggings SET deleted_at = :now, updated_at = :now WHERE tag_id = :id AND deleted_at IS NULL",
      { id, now },
    );
  }

  /** Undeletes a tag and the taggings deleted with it. */
  restore(id: string, deletedAt: string, now: string): void {
    this.db.run("UPDATE core_tags SET deleted_at = NULL, updated_at = :now WHERE id = :id", {
      id,
      now,
    });
    this.db.run(
      "UPDATE core_taggings SET deleted_at = NULL, updated_at = :now WHERE tag_id = :id AND deleted_at = :deleted_at",
      { id, deleted_at: deletedAt, now },
    );
  }

  /** Live tag ids per entity (entities without tags are left out). */
  tagIdsFor(entityType: string, entityIds: readonly string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const chunk of chunks(entityIds)) {
      const rows = this.db.all(
        "SELECT tg.entity_id, tg.tag_id FROM core_taggings tg " +
          "JOIN core_tags t ON t.id = tg.tag_id AND t.deleted_at IS NULL " +
          `WHERE tg.deleted_at IS NULL AND tg.entity_type = ? AND tg.entity_id IN (${marks(chunk)}) ` +
          "ORDER BY t.name COLLATE NOCASE",
        [entityType, ...chunk],
      );
      for (const row of rows) {
        const id = text(row, "entity_id");
        const list = result.get(id) ?? [];
        list.push(text(row, "tag_id"));
        result.set(id, list);
      }
    }
    return result;
  }

  /** Live taggings of one entity: tag id → tagging id. */
  liveTaggings(entityType: string, entityId: string): Map<string, string> {
    const rows = this.db.all(
      "SELECT id, tag_id FROM core_taggings WHERE deleted_at IS NULL AND entity_type = :type AND entity_id = :id",
      { type: entityType, id: entityId },
    );
    return new Map(rows.map((r) => [text(r, "tag_id"), text(r, "id")]));
  }

  /** Attaches a tag. */
  insertTagging(
    id: string,
    tagId: string,
    entityType: string,
    entityId: string,
    now: string,
  ): void {
    this.db.run(
      "INSERT INTO core_taggings (id, tag_id, entity_type, entity_id, created_at, updated_at, deleted_at) " +
        "VALUES (:id, :tag_id, :type, :entity_id, :now, :now, NULL)",
      { id, tag_id: tagId, type: entityType, entity_id: entityId, now },
    );
  }

  /** Detaches a tag (soft delete). */
  deleteTagging(id: string, now: string): void {
    this.db.run("UPDATE core_taggings SET deleted_at = :now, updated_at = :now WHERE id = :id", {
      id,
      now,
    });
  }
}

/** Tag use cases, including attaching tags to other modules' entities. */
export class TagService {
  private readonly repo: TagRepository;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    this.repo = new TagRepository(db);
  }

  /** Live tags, alphabetically. */
  listLive(): Tag[] {
    return this.repo.listLive();
  }

  /** Creates a tag; a repeated create with the same client id returns it. */
  create(name: string, tagId: string | null): [Tag, boolean] {
    const cleaned = normalizeTagName(name);
    checkClientId(tagId, "Ids must be UUIDv7.");
    return this.db.transaction(() => {
      if (tagId !== null) {
        const existing = this.repo.get(tagId);
        if (existing !== null) return [existing, false];
      }
      if (this.repo.findLiveByName(cleaned) !== null) {
        throw new Conflict(`A tag named '${cleaned}' already exists.`);
      }
      const now = nowIso(this.clock);
      const tag: Tag = {
        id: tagId ?? newId(),
        name: cleaned,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.repo.insert(tag);
      return [tag, true];
    });
  }

  /** Renames a live tag. */
  rename(tagId: string, name: string): Tag {
    const cleaned = normalizeTagName(name);
    return this.db.transaction(() => {
      this.live(tagId);
      const other = this.repo.findLiveByName(cleaned);
      if (other !== null && other.id !== tagId)
        throw new Conflict(`A tag named '${cleaned}' already exists.`);
      this.repo.rename(tagId, cleaned, nowIso(this.clock));
      return this.live(tagId);
    });
  }

  /** Deletes a tag (and detaches it everywhere); returns the stamp. */
  delete(tagId: string): string {
    return this.db.transaction(() => {
      this.live(tagId);
      const now = nowIso(this.clock);
      this.repo.softDelete(tagId, now);
      return now;
    });
  }

  /** Undoes a delete, with the attachments removed with it. */
  restore(tagId: string): Tag {
    return this.db.transaction(() => {
      const tag = this.repo.get(tagId);
      if (tag?.deleted_at == null) throw new NotFound("No deleted tag with this id.");
      if (this.repo.findLiveByName(tag.name) !== null) {
        throw new Conflict(`A tag named '${tag.name}' exists again; rename one first.`);
      }
      this.repo.restore(tagId, tag.deleted_at, nowIso(this.clock));
      return this.live(tagId);
    });
  }

  /** Live tag ids per entity. */
  tagsFor(entityType: string, entityIds: readonly string[]): Map<string, string[]> {
    return this.repo.tagIdsFor(entityType, entityIds);
  }

  /** Makes `tagIds` exactly the entity's tags (joins the caller's transaction). */
  setTags(ref: EntityRef, tagIds: readonly string[]): string[] {
    const wanted = unique(tagIds);
    return this.db.transaction(() => {
      const live = this.repo.liveIds(wanted);
      const unknown = wanted.filter((id) => !live.has(id)).sort();
      if (unknown.length > 0) throw new ValidationFailed(`Unknown tags: ${unknown.join(", ")}`);
      const current = this.repo.liveTaggings(ref.entityType, ref.entityId);
      const now = nowIso(this.clock);
      for (const [tagId, taggingId] of current) {
        if (!wanted.includes(tagId)) this.repo.deleteTagging(taggingId, now);
      }
      for (const tagId of wanted) {
        if (!current.has(tagId))
          this.repo.insertTagging(newId(), tagId, ref.entityType, ref.entityId, now);
      }
      return this.repo.tagIdsFor(ref.entityType, [ref.entityId]).get(ref.entityId) ?? [];
    });
  }

  private live(tagId: string): Tag {
    const tag = this.repo.get(tagId);
    if (tag?.deleted_at !== null) throw new NotFound("No tag with this id.");
    return tag;
  }
}

function out(tag: Tag) {
  return { id: tag.id, name: tag.name, created_at: tag.created_at, updated_at: tag.updated_at };
}

/** `/api/tags`. */
export const tagHandlers: Handlers = {
  core_list_tags: (_, ctx) => new TagService(ctx.db, ctx.clock).listLive().map(out),
  core_create_tag: ({ body }, ctx) => {
    const [tag, created] = new TagService(ctx.db, ctx.clock).create(body.name, body.id ?? null);
    return created ? out(tag) : new Answer(out(tag), 200);
  },
  core_rename_tag: ({ path, body }, ctx) =>
    out(new TagService(ctx.db, ctx.clock).rename(path.tag_id, body.name)),
  core_delete_tag: ({ path }, ctx) => ({
    id: path.tag_id,
    deleted_at: new TagService(ctx.db, ctx.clock).delete(path.tag_id),
  }),
  core_restore_tag: ({ path }, ctx) => out(new TagService(ctx.db, ctx.clock).restore(path.tag_id)),
};
