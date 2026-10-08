import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../api/apiContext";
import { unwrap, type ApiClient } from "../api/client";
import type { components } from "../api/schema";
import { newId } from "../ids";

/** A tag (global across modules). */
export type Tag = components["schemas"]["TagOut"];

/** Query keys for tags. */
export const tagKeys = { all: ["core", "tags"] as const };

/** All live tags, alphabetically. */
export function tagsQueryOptions(client: ApiClient) {
  return queryOptions({
    queryKey: tagKeys.all,
    queryFn: () => unwrap(client.GET("/api/tags")),
  });
}

/** Subscribes to the tag list. */
export function useTags() {
  return useQuery(tagsQueryOptions(useApiClient()));
}

/** Creates a tag optimistically with a client id; resolves to the created tag. */
export function useCreateTag() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      unwrap(client.POST("/api/tags", { body: vars })),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all });
      const previous = queryClient.getQueryData<Tag[]>(tagKeys.all);
      const now = new Date().toISOString();
      queryClient.setQueryData<Tag[]>(tagKeys.all, (tags = []) =>
        [...tags, { ...vars, created_at: now, updated_at: now }].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(tagKeys.all, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

/** Builds the variables for creating a tag with a fresh client id. */
export function newTagVars(name: string): { id: string; name: string } {
  return { id: newId(), name: name.trim() };
}
