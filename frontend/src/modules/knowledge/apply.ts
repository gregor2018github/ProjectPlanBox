/**
 * Pure cache updates mirroring the server's rules, used by the optimistic
 * mutations. The server's answer replaces these rows afterwards.
 */
import type { components } from "../../core/api/schema";
import { byPosition, placeAmong } from "../../core/ordering";
import type { Collection, Entry } from "./types";

/** Body of POST /api/knowledge/entries, with the client id required. */
export type CreateEntryVars = components["schemas"]["EntryCreate"] & { id: string };

/** Body of PATCH /api/knowledge/entries/{id}. */
export type EntryPatch = components["schemas"]["EntryPatch"];

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** A trimmed language, or null when blank (the server's rule). */
const language = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/** The entry the server will create for these variables. */
export function buildEntry(vars: CreateEntryVars, now: string): Entry {
  return {
    id: vars.id,
    collection_id: vars.collection_id ?? null,
    kind: vars.kind,
    title: oneLine(vars.title),
    body: vars.body ?? "",
    url: vars.kind === "link" ? (vars.url?.trim() ?? "") : null,
    language: vars.kind === "snippet" ? language(vars.language) : null,
    created_at: now,
    updated_at: now,
    tag_ids: vars.tag_ids ?? [],
  };
}

/** Applies a patch to one entry; it moves to the top (most recently changed). */
export function applyEntryPatch(
  entries: readonly Entry[],
  id: string,
  patch: EntryPatch,
  now: string,
): Entry[] {
  const target = entries.find((e) => e.id === id);
  if (target === undefined) return [...entries];
  const updated: Entry = { ...target, updated_at: now };
  if (patch.title != null) updated.title = oneLine(patch.title);
  if (patch.body != null) updated.body = patch.body;
  if (patch.url != null) updated.url = patch.url.trim();
  if (patch.language !== undefined) updated.language = language(patch.language);
  if (patch.collection_id !== undefined) updated.collection_id = patch.collection_id;
  if (patch.tag_ids != null) updated.tag_ids = patch.tag_ids;
  return [updated, ...entries.filter((e) => e.id !== id)];
}

/** Most recently changed first (the server's order). */
export function byRecent(a: Entry, b: Entry): number {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Replaces or adds server rows, keeping most recently changed first. */
export function mergeEntries(entries: readonly Entry[], incoming: readonly Entry[]): Entry[] {
  const ids = new Set(incoming.map((e) => e.id));
  return [...incoming, ...entries.filter((e) => !ids.has(e.id))].sort(byRecent);
}

/** Adds a collection at the end. */
export function appendCollection(
  collections: readonly Collection[],
  vars: { id: string; name: string },
  now: string,
): Collection[] {
  const sorted = [...collections].sort(byPosition);
  const position = placeAmong(sorted, null, null);
  return [
    ...sorted,
    { id: vars.id, name: oneLine(vars.name), position, created_at: now, updated_at: now },
  ];
}

/** Moves a collection between neighbours (the server's `place()` rule). */
export function moveCollection(
  collections: readonly Collection[],
  id: string,
  beforeId: string | null,
  afterId: string | null,
): Collection[] {
  const siblings = collections.filter((c) => c.id !== id).sort(byPosition);
  const position = placeAmong(siblings, beforeId, afterId);
  return collections.map((c) => (c.id === id ? { ...c, position } : c)).sort(byPosition);
}
