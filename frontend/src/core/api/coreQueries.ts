import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";

import { useApiClient } from "./apiContext";
import { unwrap, type ApiClient } from "./client";

/** Query keys owned by core. */
export const coreKeys = {
  health: ["core", "health"] as const,
  meta: ["core", "meta"] as const,
};

/** Liveness, polled so the connection indicator stays current. */
export function healthQueryOptions(client: ApiClient) {
  return queryOptions({
    queryKey: coreKeys.health,
    queryFn: () => unwrap(client.GET("/api/health")),
    refetchInterval: 15_000,
    retry: false,
  });
}

/** App metadata (timezone, week start); it never changes while running. */
export function metaQueryOptions(client: ApiClient) {
  return queryOptions({
    queryKey: coreKeys.meta,
    queryFn: () => unwrap(client.GET("/api/meta")),
    staleTime: Infinity,
  });
}

/** Subscribes to the server's health. */
export function useHealth() {
  return useQuery(healthQueryOptions(useApiClient()));
}

/** Subscribes to the app metadata. */
export function useMeta() {
  return useQuery(metaQueryOptions(useApiClient()));
}

/** Stops the server (daily-use mode only; see Meta.can_shutdown). */
export function useShutdown() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/shutdown", { body: { confirm: true } })),
  });
}
