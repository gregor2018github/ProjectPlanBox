import { RefreshCw } from "lucide-react";

import { IconButton } from "../../ui/IconButton";
import { useCloudConnected, useCloudRun } from "./useCloudRun";

/** Props for {@link SyncButton}. */
export interface SyncButtonProps {
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

/**
 * The shell's one-click Google Drive sync. Renders nothing unless this
 * device is connected to Drive, so people without sync never see it.
 */
export function SyncButton({ tooltipSide }: SyncButtonProps) {
  const connected = useCloudConnected();
  const { run, busy } = useCloudRun();
  if (!connected) return null;
  return (
    <IconButton
      label={busy ? "Syncing with Google Drive…" : "Sync with Google Drive"}
      icon={RefreshCw}
      iconClassName={busy ? "motion-safe:animate-spin" : undefined}
      tooltipSide={tooltipSide}
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        run("sync");
      }}
    />
  );
}
