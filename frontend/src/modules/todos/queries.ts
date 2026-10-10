import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap, type ApiClient } from "../../core/api/client";
import { useMeta } from "../../core/api/coreQueries";
import { startOfDayUtc, todayIn } from "../../core/time";

/** Query keys of the todos module. */
export const todoKeys = {
  all: ["todos"] as const,
  items: ["todos", "items"] as const,
  areas: ["todos", "areas"] as const,
  lists: ["todos", "lists"] as const,
  sections: ["todos", "sections"] as const,
  logbook: ["todos", "logbook"] as const,
  item: (id: string) => ["todos", "item", id] as const,
};

/** Every open todo plus today's completed ones (one cache for all views). */
export function itemsQueryOptions(client: ApiClient, timeZone: string) {
  return queryOptions({
    queryKey: todoKeys.items,
    queryFn: () =>
      unwrap(
        client.GET("/api/todos/items", {
          params: { query: { completed_since: startOfDayUtc(todayIn(timeZone), timeZone) } },
        }),
      ),
  });
}

/** Subscribes to the todo cache (waits for the server's timezone). */
export function useTodos() {
  const client = useApiClient();
  const { data: meta } = useMeta();
  return useQuery({
    ...itemsQueryOptions(client, meta?.timezone ?? "UTC"),
    enabled: meta !== undefined,
  });
}

/** Subscribes to the areas. */
export function useAreas() {
  const client = useApiClient();
  return useQuery({
    queryKey: todoKeys.areas,
    queryFn: () => unwrap(client.GET("/api/todos/areas")),
  });
}

/** Subscribes to the lists. */
export function useLists() {
  const client = useApiClient();
  return useQuery({
    queryKey: todoKeys.lists,
    queryFn: () => unwrap(client.GET("/api/todos/lists")),
  });
}

/** Subscribes to the sections. */
export function useSections() {
  const client = useApiClient();
  return useQuery({
    queryKey: todoKeys.sections,
    queryFn: () => unwrap(client.GET("/api/todos/sections")),
  });
}

/** Completed todos, newest first, loaded page by page. */
export function logbookQueryOptions(client: ApiClient) {
  return infiniteQueryOptions({
    queryKey: todoKeys.logbook,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(
        client.GET("/api/todos/items/completed", {
          params: { query: { limit: 50, ...(pageParam !== null && { cursor: pageParam }) } },
        }),
      ),
    getNextPageParam: (page) => page.next_cursor,
  });
}

/** Subscribes to the logbook. */
export function useLogbook() {
  return useInfiniteQuery(logbookQueryOptions(useApiClient()));
}

/**
 * One todo straight from the server, for todos outside the main cache (e.g.
 * a search hit completed long ago). Only fetches while `enabled`.
 */
export function useTodo(id: string, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: todoKeys.item(id),
    queryFn: () =>
      unwrap(client.GET("/api/todos/items/{todo_id}", { params: { path: { todo_id: id } } })),
    enabled,
  });
}
