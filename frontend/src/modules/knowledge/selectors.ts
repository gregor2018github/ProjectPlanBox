/** Pure derivations over the entry cache for the knowledge views. */
import type { EntryScope } from "./paths";
import type { Entry, EntryKind } from "./types";

/** Narrowing options of an entries view. */
export interface EntryFilter {
  scope: EntryScope;
  /** Null shows every kind. */
  kind: EntryKind | null;
  /** Case-insensitive words that must all appear in title, text, address or tags. */
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
    if (filter.kind !== null && entry.kind !== filter.kind) return false;
    if (words.length === 0) return true;
    const tags = tagName ? entry.tag_ids.map(tagName).join(" ") : "";
    const haystack = [entry.title, entry.body, entry.url ?? "", entry.language ?? "", tags]
      .join(" ")
      .toLowerCase();
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

/** The host name of a link, for compact display ("example.com"). */
export function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Whether a URL is safe to open (http or https only, never script). */
export function isWebUrl(url: string | null): url is string {
  return url !== null && /^https?:\/\/\S+$/i.test(url.trim());
}

/** Adds https:// to a typed address without a scheme ("example.com/a"). */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "" || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
