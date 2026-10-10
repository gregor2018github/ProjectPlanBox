/** Aliases of the generated backend types for the knowledge module. */
import type { components } from "../../core/api/schema";

/** A note, link or snippet; `collection_id` null means Unsorted. */
export type Entry = components["schemas"]["EntryOut"];

/** A named group of entries. */
export type Collection = components["schemas"]["CollectionOut"];

/** What a (cascading) delete touched. */
export type KnowledgeDeleted = components["schemas"]["KnowledgeDeletedOut"];

/** The three kinds of entries. */
export type EntryKind = Entry["kind"];

/** Every kind, in menu order. */
export const ENTRY_KINDS: readonly EntryKind[] = ["note", "link", "snippet"];

/** Singular display names of the kinds. */
export const KIND_LABELS: Record<EntryKind, string> = {
  note: "Note",
  link: "Link",
  snippet: "Snippet",
};

/** The entity type entries have in links, tags and `?item=`. */
export const ENTRY_TYPE = "knowledge.entry";

/** The entity reference of an entry, e.g. for the `?item=` search param. */
export function entryRef(id: string): string {
  return `${ENTRY_TYPE}:${id}`;
}
