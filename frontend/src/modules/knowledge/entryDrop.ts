/**
 * Drag and drop rules of the knowledge module, kept pure for tests: entries
 * are dropped onto collections in the sidebar; collections are reordered
 * among themselves.
 */
import type { DropInfo } from "../../ui/dnd";

/** The drag type of an entry row. */
export const ENTRY_DRAG_TYPE = "knowledge-entry";

/** The drag type of a collection in the sidebar. */
export const COLLECTION_DRAG_TYPE = "knowledge-collection";

/** Data of a drop target that receives entries. */
export interface CollectionDropData {
  kind: "knowledge-collection";
  /** Null is Unsorted. */
  collectionId: string | null;
}

/** Builds the drop data of a collection (null = Unsorted). */
export function collectionDropData(collectionId: string | null): CollectionDropData {
  return { kind: "knowledge-collection", collectionId };
}

/**
 * The collection an entry was dropped on: a string id, null for Unsorted, or
 * undefined when the drop did not land on a collection.
 */
export function droppedCollection(info: DropInfo): string | null | undefined {
  if (info.canceled || info.target === null) return undefined;
  const { kind, collectionId } = info.target.data;
  if (kind !== "knowledge-collection") return undefined;
  return typeof collectionId === "string" ? collectionId : null;
}

/** Where a reordered collection goes: its new neighbours, or null if it did not move. */
export function collectionMove(
  id: string,
  orderedIds: readonly string[],
  info: DropInfo,
): { before_id: string | null; after_id: string | null } | null {
  if (info.canceled || info.index === null || info.initialIndex === null) return null;
  if (info.index === info.initialIndex) return null;
  const others = orderedIds.filter((x) => x !== id);
  return { after_id: others[info.index - 1] ?? null, before_id: others[info.index] ?? null };
}
