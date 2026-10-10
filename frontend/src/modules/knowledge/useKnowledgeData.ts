import { useMemo } from "react";

import { byPosition } from "../../core/ordering";
import { useTags, type Tag } from "../../core/tags/tagQueries";
import { useCollections, useEntries } from "./queries";
import type { Collection, Entry } from "./types";

/** Everything a knowledge view reads, from the shared caches. */
export interface KnowledgeData {
  /** Most recently changed first. */
  entries: Entry[];
  /** In sidebar order. */
  collections: Collection[];
  tags: Tag[];
  /** True until the entries have loaded the first time. */
  loading: boolean;
  collectionName: (id: string | null) => string;
  tagName: (id: string) => string;
}

const EMPTY: never[] = [];

/** Subscribes to the knowledge caches and derives lookups. */
export function useKnowledgeData(): KnowledgeData {
  const entries = useEntries();
  const collections = useCollections();
  const tags = useTags();

  return useMemo(() => {
    const sorted = [...(collections.data ?? EMPTY)].sort(byPosition);
    const collectionById = new Map(sorted.map((c) => [c.id, c]));
    const tagById = new Map((tags.data ?? EMPTY).map((t: Tag) => [t.id, t]));
    return {
      entries: entries.data ?? EMPTY,
      collections: sorted,
      tags: tags.data ?? EMPTY,
      loading: entries.isPending,
      collectionName: (id) => (id === null ? "Unsorted" : (collectionById.get(id)?.name ?? "…")),
      tagName: (id) => tagById.get(id)?.name ?? "…",
    };
  }, [entries.data, entries.isPending, collections.data, tags.data]);
}
