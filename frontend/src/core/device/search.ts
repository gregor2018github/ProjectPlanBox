/**
 * Full-text search on the device: the twin of `backend/planbox/core/search/`.
 * Modules do not push changes; every search first copies what changed since
 * the last sync (ARCHITECTURE §6.3), so the index cannot miss a write.
 */
import { newId } from "../ids";
import { nowIso, type Clock } from "./clock";
import { text, type Database } from "./db";
import { refText, type EntityRef, type EntityRegistry, type EntityType } from "./entities";
import { summaries } from "./links";
import type { Handlers } from "./server";
import { instantMs, toIso } from "./time";

/** Marks the start of a matched term (a private-use character). */
export const MATCH_START = "";
/** Marks the end of a matched term. */
export const MATCH_END = "";

const MAX_TERMS = 8;
const SYNC_OVERLAP_MS = 60_000;
const TITLE_WEIGHT = 8.0;
const BODY_WEIGHT = 1.0;
const SNIPPET_TOKENS = 12;
const TERM_RE = /[\p{L}\p{N}\p{M}_]+/gu;

/** Turns what the user typed into an FTS5 expression (every word a prefix), or null. */
export function matchExpression(query: string): string | null {
  const terms = (query.toLowerCase().match(TERM_RE) ?? []).slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(" ");
}

/**
 * A stable row id per entity, so a document is replaced in place. The index
 * is local to each device, so this need not equal the PC's (blake2b) ids;
 * it stays within JavaScript's safe integers.
 */
export function indexRowid(ref: EntityRef): number {
  // cyrb53 (public domain): a fast 53-bit string hash.
  const input = refText(ref);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

interface SyncState {
  id: string;
  synced_through: string;
}

class SearchRepository {
  constructor(private readonly db: Database) {}

  syncState(entityType: string): SyncState | null {
    const row = this.db.get(
      "SELECT id, synced_through FROM core_search_sync WHERE entity_type = ? AND deleted_at IS NULL",
      [entityType],
    );
    return row === undefined
      ? null
      : { id: text(row, "id"), synced_through: text(row, "synced_through") };
  }

  insertSyncState(entityType: string, through: string, now: string): void {
    this.db.run(
      "INSERT INTO core_search_sync (id, entity_type, synced_through, created_at, updated_at, deleted_at) " +
        "VALUES (?, ?, ?, ?, ?, NULL)",
      [newId(), entityType, through, now, now],
    );
  }

  updateSyncState(id: string, through: string, now: string): void {
    this.db.run("UPDATE core_search_sync SET synced_through = ?, updated_at = ? WHERE id = ?", [
      through,
      now,
      id,
    ]);
  }

  forgetSyncStates(now: string): void {
    this.db.run(
      "UPDATE core_search_sync SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL",
      [now, now],
    );
  }

  clear(entityType: string | null = null): void {
    if (entityType === null) this.db.run("DELETE FROM core_search");
    else this.db.run("DELETE FROM core_search WHERE entity_type = ?", [entityType]);
  }

  remove(rowid: number): void {
    this.db.run("DELETE FROM core_search WHERE rowid = ?", [rowid]);
  }

  insert(rowid: number, ref: EntityRef, title: string, body: string): void {
    this.db.run(
      "INSERT INTO core_search (rowid, entity_type, entity_id, title, body) VALUES (?, ?, ?, ?, ?)",
      [rowid, ref.entityType, ref.entityId, title, body],
    );
  }

  match(expression: string, limit: number): { ref: EntityRef; title: string; snippet: string }[] {
    return this.db
      .all(
        "SELECT entity_type, entity_id, highlight(core_search, 2, :start, :end) AS title, " +
          "snippet(core_search, 3, :start, :end, '…', :tokens) AS snippet " +
          "FROM core_search WHERE core_search MATCH :expression " +
          "ORDER BY bm25(core_search, 0.0, 0.0, :title_weight, :body_weight) LIMIT :limit",
        {
          start: MATCH_START,
          end: MATCH_END,
          tokens: SNIPPET_TOKENS,
          expression,
          title_weight: TITLE_WEIGHT,
          body_weight: BODY_WEIGHT,
          limit,
        },
      )
      .map((r) => ({
        ref: { entityType: text(r, "entity_type"), entityId: text(r, "entity_id") },
        title: text(r, "title"),
        snippet: r.snippet === null ? "" : String(r.snippet),
      }));
  }
}

/** Keeps the index current and answers queries. */
export class SearchService {
  private readonly repo: SearchRepository;

  constructor(
    private readonly db: Database,
    private readonly registry: EntityRegistry,
    private readonly clock: Clock,
  ) {
    this.repo = new SearchRepository(db);
  }

  /** Live entities matching every word of `query`, best first. */
  search(
    query: string,
    limit: number,
  ): { ref: string; title: string; snippet: string; hint: string }[] {
    const expression = matchExpression(query);
    if (expression === null) return [];
    this.sync();
    const matches = this.repo.match(expression, limit + 10);
    const found = summaries(
      this.db,
      this.registry,
      matches.map((m) => m.ref),
    );
    const hits = [];
    for (const match of matches) {
      const summary = found.get(refText(match.ref));
      if (summary === undefined || summary.deleted) continue;
      hits.push({
        ref: refText(match.ref),
        title: match.title,
        snippet: match.snippet,
        hint: summary.hint,
      });
    }
    return hits.slice(0, limit);
  }

  /** Copies every change since the last sync into the index. */
  sync(): void {
    this.db.transaction(() => {
      for (const type of this.registry.all()) this.syncType(type);
    });
  }

  /** Empties the index; the next search fills it again. */
  rebuild(): void {
    this.db.transaction(() => {
      this.repo.clear();
      this.repo.forgetSyncStates(nowIso(this.clock));
    });
  }

  private syncType(type: EntityType): void {
    if (type.documents === undefined) return;
    const state = this.repo.syncState(type.name);
    const since = state === null ? null : toIso(instantMs(state.synced_through) - SYNC_OVERLAP_MS);
    const documents = type.documents(this.db, since);
    if (state === null) this.repo.clear(type.name);
    for (const doc of documents) {
      const ref = { entityType: type.name, entityId: doc.id };
      const rowid = indexRowid(ref);
      this.repo.remove(rowid);
      if (!doc.deleted) this.repo.insert(rowid, ref, doc.title, doc.body);
    }
    const now = nowIso(this.clock);
    let newest: string | null = null;
    for (const doc of documents)
      if (newest === null || doc.updatedAt > newest) newest = doc.updatedAt;
    if (state === null) this.repo.insertSyncState(type.name, newest ?? now, now);
    else if (newest !== null && newest > state.synced_through)
      this.repo.updateSyncState(state.id, newest, now);
  }
}

/** `/api/search`. */
export const searchHandlers: Handlers = {
  core_search: ({ query }, ctx) =>
    new SearchService(ctx.db, ctx.registry, ctx.clock).search(query.q ?? "", query.limit ?? 20),
};
