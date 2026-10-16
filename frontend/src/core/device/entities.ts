/**
 * Addressing entities across modules without importing them, the twin of
 * `backend/planbox/core/entities.py`. Tags, links, search and insights reach
 * module rows only through the `EntityType`s modules register.
 */
import type { Database } from "./db";

const TYPE_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** A pointer to one row of some module, e.g. `todos.todo:<uuid>`. */
export interface EntityRef {
  entityType: string;
  entityId: string;
}

/** `todos.todo:<id>`. */
export function refText(ref: EntityRef): string {
  return `${ref.entityType}:${ref.entityId}`;
}

/** Parses `<module>.<kind>:<id>`; null when malformed. */
export function parseRef(text: string): EntityRef | null {
  const colon = text.indexOf(":");
  if (colon < 0) return null;
  const entityType = text.slice(0, colon);
  const entityId = text.slice(colon + 1);
  if (!entityId || !TYPE_RE.test(entityType)) return null;
  return { entityType, entityId };
}

/** What other modules need to display a referenced entity. */
export interface EntitySummary {
  title: string;
  deleted: boolean;
  /** Short context for search hits, e.g. `Done · Groceries`. */
  hint: string;
}

/** What the search index stores for one entity (live or deleted). */
export interface SearchDocument {
  id: string;
  title: string;
  body: string;
  deleted: boolean;
  updatedAt: string;
}

/** One thing that happened to an entity, for the Insights overview. */
export interface ActivityEvent {
  action: "created" | "completed" | "deleted";
  at: string;
}

/** What an activity source is asked for. */
export interface ActivityWindow {
  since: string;
  now: string;
  zone: string;
}

/** Created and deleted events from `(created_at, deleted_at)` pairs. */
export function lifecycleEvents(rows: Iterable<[string, string | null]>): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const [createdAt, deletedAt] of rows) {
    events.push({ action: "created", at: createdAt });
    if (deletedAt !== null) events.push({ action: "deleted", at: deletedAt });
  }
  return events;
}

/** An entity kind a module exposes to tags, links, search and insights. */
export interface EntityType {
  name: string;
  summarize: (db: Database, ids: readonly string[]) => Map<string, EntitySummary>;
  documents?: (db: Database, since: string | null) => SearchDocument[];
  activity?: (db: Database, window: ActivityWindow) => ActivityEvent[];
}

/** All entity types of the enabled modules, by name. */
export class EntityRegistry {
  private readonly types = new Map<string, EntityType>();

  constructor(types: Iterable<EntityType> = []) {
    for (const type of types) this.register(type);
  }

  /** Adds a type; a name may be registered once. */
  register(type: EntityType): void {
    if (!TYPE_RE.test(type.name)) throw new Error(`bad entity type name ${type.name}`);
    if (this.types.has(type.name)) throw new Error(`entity type ${type.name} registered twice`);
    this.types.set(type.name, type);
  }

  /** The type with this name, if any. */
  get(name: string): EntityType | undefined {
    return this.types.get(name);
  }

  /** Every type, sorted by name. */
  all(): EntityType[] {
    return [...this.types.keys()].sort().map((name) => this.types.get(name) as EntityType);
  }
}
