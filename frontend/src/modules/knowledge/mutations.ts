/**
 * Optimistic mutations (ARCHITECTURE §8). Every mutation of this module runs
 * in one serial scope, applies its change to the caches immediately, rolls
 * back and shows a toast on error, and writes the server's rows back on
 * success. User-facing wording and undo live in `useKnowledgeActions`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";
import { byPosition } from "../../core/ordering";
import { useToast } from "../../ui/useToast";
import {
  appendCollection,
  applyEntryPatch,
  buildEntry,
  mergeEntries,
  moveCollection,
  type CreateEntryVars,
  type EntryPatch,
} from "./apply";
import { knowledgeKeys } from "./queries";
import type { Collection, Entry } from "./types";

const SCOPE = { id: "knowledge" };

interface CacheEdits {
  entries?: (entries: Entry[]) => Entry[];
  collections?: (collections: Collection[]) => Collection[];
}

interface OptimisticConfig<TVars, TData> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** The optimistic change to the caches. */
  edit: (vars: TVars) => CacheEdits;
  onSuccess?: (data: TData, vars: TVars) => void;
  errorTitle: string;
}

function useOptimisticMutation<TVars, TData>(config: OptimisticConfig<TVars, TData>) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: config.mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: knowledgeKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: knowledgeKeys.all });
      const edits = config.edit(vars);
      if (edits.entries) {
        const edit = edits.entries;
        queryClient.setQueryData<Entry[]>(knowledgeKeys.entries, (c) => c && edit(c));
      }
      if (edits.collections) {
        const edit = edits.collections;
        queryClient.setQueryData<Collection[]>(knowledgeKeys.collections, (c) => c && edit(c));
      }
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      show({ title: config.errorTitle, description: error.message, tone: "error" });
    },
    onSuccess: (data, vars) => {
      config.onSuccess?.(data, vars);
    },
  });
}

const now = () => new Date().toISOString();

function useMergeEntries() {
  const queryClient = useQueryClient();
  return (entries: Entry[]) => {
    queryClient.setQueryData<Entry[]>(knowledgeKeys.entries, (current = []) =>
      mergeEntries(current, entries),
    );
  };
}

function useReplaceCollection() {
  const queryClient = useQueryClient();
  return (collection: Collection) => {
    queryClient.setQueryData<Collection[]>(knowledgeKeys.collections, (current = []) =>
      [...current.filter((c) => c.id !== collection.id), collection].sort(byPosition),
    );
  };
}

// -------------------------------------------------------------------- entries

/** Creates a note, link or snippet. */
export function useCreateEntry() {
  const client = useApiClient();
  const merge = useMergeEntries();
  return useOptimisticMutation<CreateEntryVars, Entry>({
    mutationFn: (vars) => unwrap(client.POST("/api/knowledge/entries", { body: vars })),
    edit: (vars) => ({ entries: (entries) => [buildEntry(vars, now()), ...entries] }),
    onSuccess: (entry) => {
      merge([entry]);
    },
    errorTitle: "Could not add the entry",
  });
}

/** Changes title, text, address, language, collection or tags. */
export function useUpdateEntry() {
  const client = useApiClient();
  const merge = useMergeEntries();
  return useOptimisticMutation<{ id: string; patch: EntryPatch }, Entry>({
    mutationFn: ({ id, patch }) =>
      unwrap(
        client.PATCH("/api/knowledge/entries/{entry_id}", {
          params: { path: { entry_id: id } },
          body: patch,
        }),
      ),
    edit: ({ id, patch }) => ({ entries: (entries) => applyEntryPatch(entries, id, patch, now()) }),
    onSuccess: (entry) => {
      merge([entry]);
    },
    errorTitle: "Could not save the change",
  });
}

/** Deletes an entry. */
export function useDeleteEntry() {
  const client = useApiClient();
  return useOptimisticMutation<{ id: string }, unknown>({
    mutationFn: ({ id }) =>
      unwrap(
        client.DELETE("/api/knowledge/entries/{entry_id}", { params: { path: { entry_id: id } } }),
      ),
    edit: ({ id }) => ({ entries: (entries) => entries.filter((e) => e.id !== id) }),
    errorTitle: "Could not delete the entry",
  });
}

/** Restores a deleted entry. */
export function useRestoreEntry() {
  const client = useApiClient();
  const merge = useMergeEntries();
  return useOptimisticMutation<{ id: string }, Entry>({
    mutationFn: ({ id }) =>
      unwrap(
        client.POST("/api/knowledge/entries/{entry_id}/restore", {
          params: { path: { entry_id: id } },
        }),
      ),
    edit: () => ({}),
    onSuccess: (entry) => {
      merge([entry]);
    },
    errorTitle: "Could not restore the entry",
  });
}

// ---------------------------------------------------------------- collections

/** Creates a collection at the end. */
export function useCreateCollection() {
  const client = useApiClient();
  const replace = useReplaceCollection();
  return useOptimisticMutation<{ id: string; name: string }, Collection>({
    mutationFn: (vars) => unwrap(client.POST("/api/knowledge/collections", { body: vars })),
    edit: (vars) => ({ collections: (c) => appendCollection(c, vars, now()) }),
    onSuccess: replace,
    errorTitle: "Could not add the collection",
  });
}

/** Renames a collection. */
export function useRenameCollection() {
  const client = useApiClient();
  const replace = useReplaceCollection();
  return useOptimisticMutation<{ id: string; name: string }, Collection>({
    mutationFn: ({ id, name }) =>
      unwrap(
        client.PATCH("/api/knowledge/collections/{collection_id}", {
          params: { path: { collection_id: id } },
          body: { name },
        }),
      ),
    edit: ({ id, name }) => ({
      collections: (c) => c.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)),
    }),
    onSuccess: replace,
    errorTitle: "Could not rename the collection",
  });
}

/** Variables for reordering a collection. */
export interface MoveCollectionVars {
  id: string;
  before_id: string | null;
  after_id: string | null;
}

/** Reorders a collection. */
export function useMoveCollection() {
  const client = useApiClient();
  const replace = useReplaceCollection();
  return useOptimisticMutation<MoveCollectionVars, Collection>({
    mutationFn: ({ id, before_id, after_id }) =>
      unwrap(
        client.POST("/api/knowledge/collections/{collection_id}/move", {
          params: { path: { collection_id: id } },
          body: { before_id, after_id },
        }),
      ),
    edit: (v) => ({ collections: (c) => moveCollection(c, v.id, v.before_id, v.after_id) }),
    onSuccess: replace,
    errorTitle: "Could not move the collection",
  });
}

/** Deletes a collection with its entries. */
export function useDeleteCollection() {
  const client = useApiClient();
  return useOptimisticMutation<{ id: string }, { entries: number }>({
    mutationFn: ({ id }) =>
      unwrap(
        client.DELETE("/api/knowledge/collections/{collection_id}", {
          params: { path: { collection_id: id } },
        }),
      ),
    edit: ({ id }) => ({
      collections: (c) => c.filter((x) => x.id !== id),
      entries: (e) => e.filter((x) => x.collection_id !== id),
    }),
    errorTitle: "Could not delete the collection",
  });
}

/** Restores a deleted collection and the entries deleted with it. */
export function useRestoreCollection() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useOptimisticMutation<{ id: string }, unknown>({
    mutationFn: ({ id }) =>
      unwrap(
        client.POST("/api/knowledge/collections/{collection_id}/restore", {
          params: { path: { collection_id: id } },
        }),
      ),
    edit: () => ({}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
    },
    errorTitle: "Could not restore the collection",
  });
}
