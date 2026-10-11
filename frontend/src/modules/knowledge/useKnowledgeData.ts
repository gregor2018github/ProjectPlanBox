import { useMemo } from "react";

import { byPosition } from "../../core/ordering";
import { matchesTagFilter, useTagFilter } from "../../core/tags/tagFilter";
import { useTags, type Tag } from "../../core/tags/tagQueries";
import { useCollections, useEntries } from "./queries";
import type { Collection, Entry } from "./types";

/** Everything a knowledge view reads, from the shared caches. */
export interface KnowledgeData {
  /** The entries the global tag filter leaves visible, most recently changed first. */
  entries: Entry[];
  /** Every entry, regardless of the tag filter (detail panel, linking). */
  allEntries: Entry[];
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
  const { tagIds: filterTagIds } = useTagFilter();

  return useMemo(() => {
    const sorted = [...(collections.data ?? EMPTY)].sort(byPosition);
    const collectionById = new Map(sorted.map((c) => [c.id, c]));
    const tagById = new Map((tags.data ?? EMPTY).map((t: Tag) => [t.id, t]));
    const allEntries = entries.data ?? EMPTY;
    return {
      entries:
        filterTagIds.length === 0
          ? allEntries
          : allEntries.filter((e) => matchesTagFilter(e.tag_ids, filterTagIds)),
      allEntries,
      collections: sorted,
      tags: tags.data ?? EMPTY,
      loading: entries.isPending,
      collectionName: (id) => (id === null ? "Unsorted" : (collectionById.get(id)?.name ?? "…")),
      tagName: (id) => tagById.get(id)?.name ?? "…",
    };
  }, [entries.data, entries.isPending, collections.data, tags.data, filterTagIds]);
}
