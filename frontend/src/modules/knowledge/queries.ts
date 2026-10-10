import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";

/** Query keys of the knowledge module. */
export const knowledgeKeys = {
  all: ["knowledge"] as const,
  entries: ["knowledge", "entries"] as const,
  collections: ["knowledge", "collections"] as const,
};

/** Every live entry (one cache for all views; a personal knowledge base is small). */
export function useEntries() {
  const client = useApiClient();
  return useQuery({
    queryKey: knowledgeKeys.entries,
    queryFn: () => unwrap(client.GET("/api/knowledge/entries")),
  });
}

/** Subscribes to the collections. */
export function useCollections() {
  const client = useApiClient();
  return useQuery({
    queryKey: knowledgeKeys.collections,
    queryFn: () => unwrap(client.GET("/api/knowledge/collections")),
  });
}
