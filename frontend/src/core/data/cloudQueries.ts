import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";

/** Query keys owned by Google Drive sync. */
export const cloudKeys = {
  status: ["core", "cloud"] as const,
  devices: ["core", "cloud", "devices"] as const,
};

/** Sync as this device sees it; polled while a browser sign-in is open. */
export function useCloudStatus() {
  const client = useApiClient();
  return useQuery({
    queryKey: cloudKeys.status,
    queryFn: () => unwrap(client.GET("/api/cloud")),
    refetchInterval: (query) => (query.state.data?.connecting === true ? 2000 : false),
  });
}

/** The devices with a file in Drive (asks Google, so only when connected). */
export function useCloudDevices(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: cloudKeys.devices,
    queryFn: () => unwrap(client.GET("/api/cloud/devices")),
    enabled,
    retry: false,
  });
}

/** Starts signing in: on a PC it returns Google's page to open, on the phone it signs in. */
export function useConnectCloud() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/cloud/connect", { body: { confirm: true } })),
    onSuccess: (started) => {
      queryClient.setQueryData(cloudKeys.status, started.status);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cloudKeys.status }),
  });
}

/** Signs this device out of Drive (the files there stay). */
export function useDisconnectCloud() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/cloud/disconnect", { body: { confirm: true } })),
    onSuccess: (status) => {
      queryClient.setQueryData(cloudKeys.status, status);
    },
  });
}

/** Sync, upload or download. A download can change anything, so every query refetches. */
export function useCloudTransfer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kind: "sync" | "upload" | "download") => {
      const body = { confirm: true as const };
      if (kind === "upload")
        return { kind, upload: await unwrap(client.POST("/api/cloud/upload", { body })) };
      if (kind === "download") {
        return { kind, download: await unwrap(client.POST("/api/cloud/download", { body })) };
      }
      return { kind, ...(await unwrap(client.POST("/api/cloud/sync", { body }))) };
    },
    onSettled: (result) =>
      result?.kind === "upload"
        ? queryClient.invalidateQueries({ queryKey: cloudKeys.status })
        : queryClient.invalidateQueries(),
  });
}
