/** Pure derivations over the entry cache for the knowledge views. */
import type { EntryScope } from "./paths";
import type { Entry } from "./types";

/** Narrowing options of an entries view. */
export interface EntryFilter {
  scope: EntryScope;
  /** Case-insensitive words that must all appear in the title, the text or the tags. */
  query: string;
  /** Tag names by id, so the query matches tags too. */
  tagName?: (id: string) => string;
}

function inScope(entry: Entry, scope: EntryScope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "unsorted") return entry.collection_id === null;
  return entry.collection_id === scope.id;
}

/** The entries a view shows, keeping the cache's order (most recently changed first). */
export function filterEntries(entries: readonly Entry[], filter: EntryFilter): Entry[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  const { tagName } = filter;
  return entries.filter((entry) => {
    if (!inScope(entry, filter.scope)) return false;
    if (words.length === 0) return true;
    const tags = tagName ? entry.tag_ids.map(tagName).join(" ") : "";
    const haystack = [entry.title, entry.body, tags].join(" ").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Entry counts for the sidebar: per collection id, unsorted and total. */
export function entryCounts(entries: readonly Entry[]): {
  total: number;
  unsorted: number;
  byCollection: Record<string, number>;
} {
  const byCollection: Record<string, number> = {};
  let unsorted = 0;
  for (const entry of entries) {
    if (entry.collection_id === null) unsorted += 1;
    else byCollection[entry.collection_id] = (byCollection[entry.collection_id] ?? 0) + 1;
  }
  return { total: entries.length, unsorted, byCollection };
}

/**
 * The collection the view on screen shows (a collection page), so a new page
 * goes there; null (Unsorted) everywhere else, or when it no longer exists.
 */
export function collectionOnScreen(
  pathname: string,
  collectionIds: readonly string[],
): string | null {
  const id = /^\/knowledge\/collections\/([^/]+)/.exec(pathname)?.[1];
  return id !== undefined && collectionIds.includes(id) ? id : null;
}
