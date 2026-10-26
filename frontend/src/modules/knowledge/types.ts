/** Aliases of the generated backend types for the knowledge module. */
import type { components } from "../../core/api/schema";

/** A page; `collection_id` null means Unsorted. */
export type Entry = components["schemas"]["EntryOut"];

/** What a page holds: freely placed boxes of rich text and, above them, drawings. */
export type PageContent = components["schemas"]["PageContent"];

/** One box on a page: where it sits, how wide it is, and its Tiptap document. */
export type PageBox = components["schemas"]["PageBox"];

/** A drawing on a page: pen strokes that move together, like a layer. */
export type PageDrawing = components["schemas"]["PageDrawing"];

/** One pen stroke: points relative to its drawing's top left. */
export type PageStroke = components["schemas"]["PageStroke"];

/** A pen colour by name ("default" is the text colour, so ink follows the theme). */
export type InkColor = PageStroke["color"];

/** A box's rich-text document (Tiptap/ProseMirror JSON). */
export type PageDoc = PageBox["doc"];

/** A named group of entries. */
export type Collection = components["schemas"]["CollectionOut"];

/** What a (cascading) delete touched. */
export type KnowledgeDeleted = components["schemas"]["KnowledgeDeletedOut"];

/** The title a new page starts with (selected, so typing replaces it). */
export const UNTITLED = "Untitled page";

/** The entity type entries have in links, tags and `?item=`. */
export const ENTRY_TYPE = "knowledge.entry";

/** The entity reference of an entry, e.g. for the `?item=` search param. */
export function entryRef(id: string): string {
  return `${ENTRY_TYPE}:${id}`;
}
