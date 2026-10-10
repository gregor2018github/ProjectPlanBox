/** Builders for knowledge test rows. */
import type { Collection, Entry } from "./types";

let counter = 0;

/** A note (override any field). */
export function makeEntry(fields: Partial<Entry> = {}): Entry {
  counter += 1;
  const stamp = `2026-10-0${String(1 + (counter % 8))}T10:00:00.000Z`;
  return {
    id: `entry-${String(counter)}`,
    collection_id: null,
    kind: "note",
    title: `Entry ${String(counter)}`,
    body: "",
    url: null,
    language: null,
    created_at: stamp,
    updated_at: stamp,
    tag_ids: [],
    ...fields,
  };
}

/** A collection (override any field). */
export function makeCollection(fields: Partial<Collection> = {}): Collection {
  counter += 1;
  return {
    id: `collection-${String(counter)}`,
    name: `Collection ${String(counter)}`,
    position: "a0",
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    ...fields,
  };
}
