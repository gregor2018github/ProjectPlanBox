/** Links on the device: the twin of `backend/planbox/core/links/`. */
import { newId } from "../ids";
import { nowIso, type Clock } from "./clock";
import { checkClientId } from "./common";
import { text, textOrNull, type Database, type Row } from "./db";
import {
  parseRef,
  refText,
  type EntityRef,
  type EntityRegistry,
  type EntitySummary,
} from "./entities";
import { Conflict, NotFound, ValidationFailed } from "./errors";
import { Answer, type Handlers } from "./server";

const UNKNOWN_TITLE = "Unknown item";
const COLUMNS =
  "id, source_type, source_id, target_type, target_id, created_at, updated_at, deleted_at";

interface Link {
  id: string;
  source: EntityRef;
  target: EntityRef;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LinkEnd {
  ref: string;
  title: string;
  deleted: boolean;
}

interface LinkView {
  id: string;
  source: LinkEnd;
  target: LinkEnd;
  created_at: string;
}

function linkOf(row: Row): Link {
  return {
    id: text(row, "id"),
    source: { entityType: text(row, "source_type"), entityId: text(row, "source_id") },
    target: { entityType: text(row, "target_type"), entityId: text(row, "target_id") },
    created_at: text(row, "created_at"),
    updated_at: text(row, "updated_at"),
    deleted_at: textOrNull(row, "deleted_at"),
  };
}

/** Parses an entity reference for the API. */
export function apiRef(value: string): EntityRef {
  const ref = parseRef(value);
  if (ref === null) throw new ValidationFailed(`Not an entity reference: '${value}'.`);
  return ref;
}

/** Summaries per ref text; refs of unregistered types or unknown ids are missing. */
export function summaries(
  db: Database,
  registry: EntityRegistry,
  refs: Iterable<EntityRef>,
): Map<string, EntitySummary> {
  const idsByType = new Map<string, string[]>();
  for (const ref of refs) {
    const ids = idsByType.get(ref.entityType) ?? [];
    if (!ids.includes(ref.entityId)) ids.push(ref.entityId);
    idsByType.set(ref.entityType, ids);
  }
  const result = new Map<string, EntitySummary>();
  for (const [entityType, ids] of idsByType) {
    const registered = registry.get(entityType);
    if (registered === undefined) continue;
    for (const [id, summary] of registered.summarize(db, ids)) {
      result.set(refText({ entityType, entityId: id }), summary);
    }
  }
  return result;
}

class LinkRepository {
  constructor(private readonly db: Database) {}

  get(id: string): Link | null {
    const row = this.db.get(`SELECT ${COLUMNS} FROM core_links WHERE id = :id`, { id });
    return row === undefined ? null : linkOf(row);
  }

  liveFor(ref: EntityRef): Link[] {
    return this.db
      .all(
        `SELECT ${COLUMNS} FROM core_links WHERE deleted_at IS NULL AND (` +
          "(source_type = :type AND source_id = :id) OR (target_type = :type AND target_id = :id)" +
          ") ORDER BY created_at, id",
        { type: ref.entityType, id: ref.entityId },
      )
      .map(linkOf);
  }

  liveBetween(a: EntityRef, b: EntityRef): Link | null {
    const row = this.db.get(
      `SELECT ${COLUMNS} FROM core_links WHERE deleted_at IS NULL AND (` +
        "(source_type = :at AND source_id = :ai AND target_type = :bt AND target_id = :bi) OR " +
        "(source_type = :bt AND source_id = :bi AND target_type = :at AND target_id = :ai))",
      { at: a.entityType, ai: a.entityId, bt: b.entityType, bi: b.entityId },
    );
    return row === undefined ? null : linkOf(row);
  }

  insert(link: Link): void {
    this.db.run(
      `INSERT INTO core_links (${COLUMNS}) VALUES ` +
        "(:id, :source_type, :source_id, :target_type, :target_id, :created_at, :updated_at, :deleted_at)",
      {
        id: link.id,
        source_type: link.source.entityType,
        source_id: link.source.entityId,
        target_type: link.target.entityType,
        target_id: link.target.entityId,
        created_at: link.created_at,
        updated_at: link.updated_at,
        deleted_at: link.deleted_at,
      },
    );
  }

  setDeleted(id: string, deletedAt: string | null, now: string): void {
    this.db.run(
      "UPDATE core_links SET deleted_at = :deleted_at, updated_at = :now WHERE id = :id",
      {
        id,
        deleted_at: deletedAt,
        now,
      },
    );
  }
}

class LinkService {
  private readonly repo: LinkRepository;

  constructor(
    private readonly db: Database,
    private readonly registry: EntityRegistry,
    private readonly clock: Clock,
  ) {
    this.repo = new LinkRepository(db);
  }

  linksOf(ref: EntityRef): LinkView[] {
    return this.views(this.repo.liveFor(ref));
  }

  create(source: EntityRef, target: EntityRef, linkId: string | null): [LinkView, boolean] {
    checkClientId(linkId);
    if (refText(source) === refText(target))
      throw new ValidationFailed("An item cannot link to itself.");
    return this.db.transaction(() => {
      if (linkId !== null) {
        const existing = this.repo.get(linkId);
        if (existing !== null) return [this.view(existing), false];
      }
      for (const end of [source, target]) {
        const summary = summaries(this.db, this.registry, [end]).get(refText(end));
        if (summary === undefined || summary.deleted) {
          throw new ValidationFailed(`Nothing to link at ${refText(end)}.`);
        }
      }
      if (this.repo.liveBetween(source, target) !== null) {
        throw new Conflict("These two items are already linked.");
      }
      const now = nowIso(this.clock);
      const link: Link = {
        id: linkId ?? newId(),
        source,
        target,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      this.repo.insert(link);
      return [this.view(link), true];
    });
  }

  delete(linkId: string): string {
    return this.db.transaction(() => {
      const link = this.repo.get(linkId);
      if (link?.deleted_at !== null) throw new NotFound("No link with this id.");
      const now = nowIso(this.clock);
      this.repo.setDeleted(linkId, now, now);
      return now;
    });
  }

  restore(linkId: string): LinkView {
    return this.db.transaction(() => {
      const link = this.repo.get(linkId);
      if (link?.deleted_at == null) throw new NotFound("No deleted link with this id.");
      if (this.repo.liveBetween(link.source, link.target) !== null) {
        throw new Conflict("These two items are already linked again.");
      }
      this.repo.setDeleted(linkId, null, nowIso(this.clock));
      return this.view(link);
    });
  }

  private view(link: Link): LinkView {
    return this.views([link])[0] as LinkView;
  }

  private views(links: Link[]): LinkView[] {
    const found = summaries(
      this.db,
      this.registry,
      links.flatMap((l) => [l.source, l.target]),
    );
    const end = (ref: EntityRef): LinkEnd => {
      const summary = found.get(refText(ref));
      return summary === undefined
        ? { ref: refText(ref), title: UNKNOWN_TITLE, deleted: true }
        : { ref: refText(ref), title: summary.title, deleted: summary.deleted };
    };
    return links.map((l) => ({
      id: l.id,
      source: end(l.source),
      target: end(l.target),
      created_at: l.created_at,
    }));
  }
}

/** `/api/links`. */
export const linkHandlers: Handlers = {
  core_list_links: ({ query }, ctx) =>
    new LinkService(ctx.db, ctx.registry, ctx.clock).linksOf(apiRef(query.entity)),
  core_create_link: ({ body }, ctx) => {
    const [view, created] = new LinkService(ctx.db, ctx.registry, ctx.clock).create(
      apiRef(body.source),
      apiRef(body.target),
      body.id ?? null,
    );
    return created ? view : new Answer(view, 200);
  },
  core_delete_link: ({ path }, ctx) => ({
    id: path.link_id,
    deleted_at: new LinkService(ctx.db, ctx.registry, ctx.clock).delete(path.link_id),
  }),
  core_restore_link: ({ path }, ctx) =>
    new LinkService(ctx.db, ctx.registry, ctx.clock).restore(path.link_id),
};
