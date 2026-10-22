/** Pure statistics over the cached knowledge entries (live ones only). */
import { addMonths, startOfMonthOf, zonedParts, type IsoDate } from "../../core/time";
import type { Collection, Entry } from "./types";

/** A labelled count. */
export interface Count {
  key: string;
  label: string;
  count: number;
}

/** Words across the pages' text (runs of letters or digits). */
export function wordCount(entries: readonly Entry[]): number {
  let words = 0;
  for (const entry of entries) words += entry.body.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return words;
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
