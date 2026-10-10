import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";
import type { components } from "../api/schema";
import { useDebouncedValue } from "../useDebouncedValue";

/** One result of GET /api/search. */
export type SearchHit = components["schemas"]["SearchHitOut"];

/** How long typing must pause before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 150;

const EMPTY: SearchHit[] = [];

/** Query keys of core search. */
export const searchKeys = {
  all: ["search"] as const,
  query: (q: string, limit: number) => ["search", q, limit] as const,
};

/**
 * Searches every module's items on the server as the user types (debounced).
 * Shows the previous results while the next ones load; an empty query or a
 * failed request yields no hits.
 */
export function useSearch(query: string, limit = 20): { hits: SearchHit[]; pending: boolean } {
  const client = useApiClient();
  const q = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const result = useQuery({
    queryKey: searchKeys.query(q, limit),
    queryFn: ({ signal }) =>
      unwrap(client.GET("/api/search", { params: { query: { q, limit } }, signal })),
    enabled: q !== "",
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 30_000,
  });
  const empty = query.trim() === "" || q === "";
  return {
    hits: empty ? EMPTY : (result.data ?? EMPTY),
    pending: !empty && (q !== query.trim() || result.isFetching),
  };
}
