/** Pure statistics over the cached knowledge entries (live ones only). */
import { addMonths, startOfMonthOf, zonedParts, type IsoDate } from "../../core/time";
import type { Collection, Entry, EntryKind } from "./types";

/** A labelled count. */
export interface Count {
  key: string;
  label: string;
  count: number;
}

/** Entries per kind. */
export function countsByKind(entries: readonly Entry[]): Record<EntryKind, number> {
  const counts: Record<EntryKind, number> = { note: 0, link: 0, snippet: 0 };
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}

function ranked(counts: Map<string, Count>): Count[] {
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function tally(counts: Map<string, Count>, key: string, label: string): void {
  const found = counts.get(key);
  if (found) found.count += 1;
  else counts.set(key, { key, label, count: 1 });
}

/** Entries per collection (Unsorted included when used), largest first. */
export function countsByCollection(
  entries: readonly Entry[],
  collections: readonly Collection[],
): Count[] {
  const names = new Map(collections.map((c) => [c.id, c.name]));
  const counts = new Map<string, Count>();
  for (const entry of entries) {
    const id = entry.collection_id;
    tally(counts, id ?? "unsorted", id === null ? "Unsorted" : (names.get(id) ?? "…"));
  }
  return ranked(counts);
}

/** Saved links per site (host without "www."), largest first. */
export function countsBySite(entries: readonly Entry[]): Count[] {
  const counts = new Map<string, Count>();
  for (const entry of entries) {
    if (entry.kind !== "link" || entry.url === null) continue;
    let host: string;
    try {
      host = new URL(entry.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    tally(counts, host, host);
  }
  return ranked(counts);
}

/** Snippets per language ("Plain text" when none is set), largest first. */
export function countsByLanguage(entries: readonly Entry[]): Count[] {
  const counts = new Map<string, Count>();
  for (const entry of entries) {
    if (entry.kind !== "snippet") continue;
    const language = entry.language?.trim() ?? "";
    tally(counts, language.toLowerCase(), language === "" ? "Plain text" : language);
  }
  return ranked(counts);
}

/** Entries per tag id, largest first (labels are the ids; the caller names them). */
export function countsByTag(entries: readonly Entry[]): Count[] {
  const counts = new Map<string, Count>();
  for (const entry of entries) for (const tagId of entry.tag_ids) tally(counts, tagId, tagId);
  return ranked(counts);
}

/** Entries added per local month, the `months` months ending with today's, oldest first. */
export function addedPerMonth(
  entries: readonly Entry[],
  today: IsoDate,
  timeZone: string,
  months = 12,
): { month: IsoDate; count: number }[] {
  const first = addMonths(startOfMonthOf(today), -(months - 1));
  const result = Array.from({ length: months }, (_, i) => ({
    month: addMonths(first, i),
    count: 0,
  }));
  for (const entry of entries) {
    const month = startOfMonthOf(zonedParts(entry.created_at, timeZone).date);
    const bucket = result.find((r) => r.month === month);
    if (bucket) bucket.count += 1;
  }
  return result;
}
