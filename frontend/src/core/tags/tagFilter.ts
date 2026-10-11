/**
 * The global tag filter: while it is on, views show only items carrying
 * every filter tag. It lives in the `tags` search param (comma-separated
 * ids), which the root route retains across navigation, so it follows the
 * user from view to view, survives a reload and works with Back.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { useTags } from "./tagQueries";

/** Reads the `tags` search param into a list of tag ids. */
export function parseTagFilter(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(",").filter((id) => id !== ""))];
}

/** Serializes tag ids for the `tags` search param; undefined drops the param. */
export function serializeTagFilter(tagIds: readonly string[]): string | undefined {
  return tagIds.length === 0 ? undefined : tagIds.join(",");
}

/** True when `itemTagIds` contains every tag in `filter` (an empty filter matches all). */
export function matchesTagFilter(
  itemTagIds: readonly string[],
  filter: readonly string[],
): boolean {
  return filter.every((id) => itemTagIds.includes(id));
}

/** The active filter and ways to change it. */
export interface TagFilter {
  /** Active filter tags; ids of deleted tags are dropped. */
  tagIds: readonly string[];
  active: boolean;
  setTagIds: (tagIds: readonly string[]) => void;
  clear: () => void;
}

const EMPTY: readonly string[] = [];

/** Subscribes to the global tag filter. */
export function useTagFilter(): TagFilter {
  // Module routes are assembled at runtime, so the router cannot type search params here.
  const raw: unknown = useSearch({
    strict: false,
    select: (search: Record<string, unknown>): unknown => search.tags,
  });
  const { data: tags } = useTags();
  const navigate = useNavigate();

  const tagIds = useMemo(() => {
    const ids = parseTagFilter(raw);
    if (ids.length === 0) return EMPTY;
    // A filter on a deleted tag would hide everything, so it is ignored.
    if (tags === undefined) return ids;
    const live = new Set(tags.map((t) => t.id));
    return ids.filter((id) => live.has(id));
  }, [raw, tags]);

  const setTagIds = useCallback(
    (next: readonly string[]) => {
      void navigate({
        to: ".",
        replace: true,
        search: (prev: Record<string, unknown>) => ({ ...prev, tags: serializeTagFilter(next) }),
      });
    },
    [navigate],
  );
  const clear = useCallback(() => {
    setTagIds(EMPTY);
  }, [setTagIds]);

  return useMemo(
    () => ({ tagIds, active: tagIds.length > 0, setTagIds, clear }),
    [tagIds, setTagIds, clear],
  );
}
