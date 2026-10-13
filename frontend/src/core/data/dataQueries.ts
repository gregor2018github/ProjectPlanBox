import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";
import type { ExportFile } from "../api/types";

/** Query keys owned by the Data page. */
export const dataKeys = {
  backups: ["core", "data", "backups"] as const,
};

/** The local backups and the off-site folder's state. */
export function useBackups() {
  const client = useApiClient();
  return useQuery({
    queryKey: dataKeys.backups,
    queryFn: () => unwrap(client.GET("/api/data/backups")),
    refetchInterval: 60_000,
  });
}

/** Takes a manual backup (not optimistic: the server names the file). */
export function useBackUpNow() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/data/backups", { body: { confirm: true } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKeys.backups }),
  });
}

/** Fetches a full export of the database. */
export function useExport() {
  const client = useApiClient();
  return useMutation({ mutationFn: () => unwrap(client.GET("/api/data/export")) });
}

/**
 * Merges an export into the database. Any cached data may have changed, so
 * every query is refetched afterwards.
 */
export function useImport() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: ExportFile) => unwrap(client.POST("/api/data/import", { body: file })),
    onSettled: () => queryClient.invalidateQueries(),
  });
}
