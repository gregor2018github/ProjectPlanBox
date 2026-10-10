/**
 * What the user can do to knowledge entries and collections, in their words:
 * each action applies the optimistic mutation and records how to undo it
 * (a toast for deletes, Ctrl+Z for everything).
 */
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { newId } from "../../core/ids";
import { useUndo } from "../../core/undo/undoContext";
import { useToast } from "../../ui/useToast";
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
import { entryRef, KIND_LABELS, type Collection, type Entry } from "./types";

/** Returns the knowledge actions bound to the current caches. */
export function useKnowledgeActions() {
  const navigate = useNavigate();
  const pushUndo = useUndo();
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const restoreEntry = useRestoreEntry();
  const createCollection = useCreateCollection();
  const renameCollection = useRenameCollection();
  const moveCollection = useMoveCollection();
  const deleteCollection = useDeleteCollection();
  const restoreCollection = useRestoreCollection();

  return useMemo(
    () => ({
      /** Creates an entry; returns its id immediately (optimistic). */
      create(input: Omit<CreateEntryVars, "id">): string {
        const id = newId();
        createEntry.mutate({ ...input, id });
        return id;
      },

      update(id: string, patch: EntryPatch): void {
        updateEntry.mutate({ id, patch });
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
        deleteEntry.mutate({ id: entry.id });
        pushUndo({
          label: `Deleted ${KIND_LABELS[entry.kind].toLowerCase()} “${entry.title}”`,
          undo: () => {
            restoreEntry.mutate({ id: entry.id });
          },
        });
      },

      /** Opens an entry in the detail panel. */
      open(entry: Entry): void {
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, item: entryRef(entry.id) }),
        });
      },

      /** Copies text (a snippet's code, a link's address) and confirms with a toast. */
      copy(text: string, confirmation: string): void {
        navigator.clipboard.writeText(text).then(
          () => {
            show({ title: confirmation });
          },
          () => {
            show({ title: "Could not copy", tone: "error" });
          },
        );
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
    }),
    [
      navigate,
      pushUndo,
      show,
      createEntry,
      updateEntry,
      deleteEntry,
      restoreEntry,
      createCollection,
      renameCollection,
      moveCollection,
      deleteCollection,
      restoreCollection,
    ],
  );
}

/** The bound knowledge actions. */
export type KnowledgeActions = ReturnType<typeof useKnowledgeActions>;
