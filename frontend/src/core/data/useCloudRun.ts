import { useMutationState } from "@tanstack/react-query";

import { useToast } from "../../ui/useToast";
import { cloudKeys, useCloudStatus, useCloudTransfer } from "./cloudQueries";
import { downloadSummary, formatBytes } from "./format";

/** What a Drive transfer does: both ways, or one. */
export type CloudRunKind = "sync" | "upload" | "download";

/** Whether this device is signed in to Google Drive, so a quick sync makes sense. */
export function useCloudConnected(): boolean {
  return useCloudStatus().data?.connected === true;
}

/**
 * Runs a Drive transfer and reports it in a toast: what was merged and
 * uploaded, or the server's error. Shared by the Data page and the shell's
 * quick sync button.
 */
export function useCloudRun() {
  const transfer = useCloudTransfer();
  const { show } = useToast();
  // Any transfer in flight, from this button or another one (the Data page
  // and the shell's quick sync can both be on screen).
  const pending = useMutationState({
    filters: { mutationKey: cloudKeys.transfer, status: "pending" },
    select: (mutation) => mutation.state.variables as CloudRunKind,
  });
  const running = pending[0];

  const run = (kind: CloudRunKind, onDone?: () => void) => {
    transfer.mutate(kind, {
      onSuccess: (result) => {
        const parts: string[] = [];
        if (result.download !== undefined) parts.push(downloadSummary(result.download));
        if (result.upload !== undefined) parts.push(`Uploaded ${formatBytes(result.upload.size)}.`);
        show({
          title: kind === "sync" ? "Synced" : kind === "upload" ? "Uploaded" : "Downloaded",
          description: parts.join(" "),
        });
        onDone?.();
      },
      onError: (error) => {
        show({
          title: kind === "sync" ? "Could not sync" : `Could not ${kind}`,
          description: error.message,
          tone: "error",
        });
      },
    });
  };

  return {
    run,
    busy: running !== undefined,
    /** The transfer in flight, if any. */
    running,
  };
}
