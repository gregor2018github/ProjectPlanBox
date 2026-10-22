/**
 * What the user can do to knowledge pages and collections, in their words:
 * each action applies the optimistic mutation and records how to undo it
 * (a toast for deletes, Ctrl+Z for everything).
 */
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { confirmDelete } from "../../core/confirm/confirmDelete";
import { newId } from "../../core/ids";
import { useTagFilter } from "../../core/tags/tagFilter";
import { useUndo } from "../../core/undo/undoContext";
import type { CreateEntryVars, EntryPatch } from "./apply";
import {
  useCreateCollection,
  useCreateEntry,
  useDeleteCollection,
  useDeleteEntry,
  useMoveCollection,
  useRenameCollection,
  useRestoreCollection,
  useRestoreEntry,
  useUpdateEntry,
  type MoveCollectionVars,
} from "./mutations";
import { knowledgePaths } from "./paths";
import { entryRef, UNTITLED, type Collection, type Entry } from "./types";

/** Returns the knowledge actions bound to the current caches. */
export function useKnowledgeActions() {
  const navigate = useNavigate();
  const pushUndo = useUndo();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const restoreEntry = useRestoreEntry();
  const createCollection = useCreateCollection();
  const renameCollection = useRenameCollection();
  const moveCollection = useMoveCollection();
  const deleteCollection = useDeleteCollection();
  const restoreCollection = useRestoreCollection();
  const { tagIds: filterTagIds } = useTagFilter();

  return useMemo(() => {
    /**
     * Creates an entry; returns its id immediately (optimistic). It also gets
     * the active filter tags, so it does not vanish from the filtered view.
     */
    const create = (input: Omit<CreateEntryVars, "id">): string => {
      const id = newId();
      const tag_ids = [...new Set([...(input.tag_ids ?? []), ...filterTagIds])];
      createEntry.mutate({ ...input, id, tag_ids });
      return id;
    };

    return {
      create,

      /** Creates an empty page in a collection (null = Unsorted) and opens it. */
      createPage(collectionId: string | null): string {
        const id = create({ title: UNTITLED, collection_id: collectionId });
        void navigate({ to: knowledgePaths.page(id) });
        return id;
      },

      /** Saves a change; `keepalive` lets the request outlive the page (it is being left). */
      update(id: string, patch: EntryPatch, options: { keepalive?: boolean } = {}): void {
        updateEntry.mutate({ id, patch, keepalive: options.keepalive ?? false });
      },

      /** Moves an entry to a collection (null = Unsorted). */
      moveTo(entry: Entry, collectionId: string | null): void {
        if (entry.collection_id === collectionId) return;
        const back = entry.collection_id;
        updateEntry.mutate({ id: entry.id, patch: { collection_id: collectionId } });
        pushUndo({
          label: `Moved “${entry.title}”`,
          silent: true,
          undo: () => {
            updateEntry.mutate({ id: entry.id, patch: { collection_id: back } });
          },
        });
      },

      remove(entry: Entry): void {
        confirmDelete(
          { title: "Delete page?", description: `“${entry.title}” will be deleted.` },
          () => {
            deleteEntry.mutate({ id: entry.id });
            pushUndo({
              label: `Deleted page “${entry.title}”`,
              undo: () => {
                restoreEntry.mutate({ id: entry.id });
              },
            });
          },
        );
      },

      /** Opens a page, large, in the main area. */
      open(entry: Entry): void {
        void navigate({ to: knowledgePaths.page(entry.id) });
      },

      /** Opens a page's details (collection, tags, links) in the side panel. */
      openDetails(entry: Entry): void {
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, item: entryRef(entry.id) }),
        });
      },

      createCollection(name: string): string {
        const id = newId();
        createCollection.mutate({ id, name: name.trim() });
        return id;
      },

      renameCollection(id: string, name: string): void {
        renameCollection.mutate({ id, name: name.trim() });
      },

      moveCollection(vars: MoveCollectionVars): void {
        moveCollection.mutate(vars);
      },

      removeCollection(collection: Collection): void {
        confirmDelete(
          {
            title: "Delete collection?",
            description: `“${collection.name}” and the entries in it will be deleted.`,
          },
          () => {
            deleteCollection.mutate(
              { id: collection.id },
              {
                onSuccess: ({ entries }) => {
                  const inside =
                    entries > 0 ? ` and ${entries} entr${entries === 1 ? "y" : "ies"}` : "";
                  pushUndo({
                    label: `Deleted collection “${collection.name}”${inside}`,
                    undo: () => {
                      restoreCollection.mutate({ id: collection.id });
                    },
                  });
                },
              },
            );
          },
        );
      },
    };
  }, [
    navigate,
    pushUndo,
    createEntry,
    updateEntry,
    deleteEntry,
    restoreEntry,
    createCollection,
    renameCollection,
    moveCollection,
    deleteCollection,
    restoreCollection,
    filterTagIds,
  ]);
}

/** The bound knowledge actions. */
export type KnowledgeActions = ReturnType<typeof useKnowledgeActions>;
