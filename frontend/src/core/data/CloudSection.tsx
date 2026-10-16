import { useMeta } from "../api/coreQueries";
import { IS_DEVICE } from "../platform";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/useToast";
import {
  useCloudDevices,
  useCloudStatus,
  useCloudTransfer,
  useConnectCloud,
  useDisconnectCloud,
} from "./cloudQueries";
import { downloadSummary, formatBytes, formatInstant } from "./format";

/**
 * The Data page's Google Drive block: connect this device, then sync. Each
 * device keeps one file in a hidden PlanBox folder in Drive; syncing merges
 * the others' files (newer versions win) and uploads this device's.
 */
export function CloudSection() {
  const status = useCloudStatus();
  const data = status.data;
  const connected = data?.connected === true;
  const devices = useCloudDevices(connected);
  const connect = useConnectCloud();
  const disconnect = useDisconnectCloud();
  const transfer = useCloudTransfer();
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const { show } = useToast();

  const failed = (title: string) => (error: Error) => {
    show({ title, description: error.message, tone: "error" });
  };

  const startConnect = () => {
    // Open the tab now, while the click still counts as the user's: browsers
    // block windows opened later, after the request comes back.
    const tab = IS_DEVICE ? null : window.open("about:blank", "_blank");
    connect.mutate(undefined, {
      onSuccess: (started) => {
        if (started.auth_url !== null && tab !== null) tab.location.href = started.auth_url;
        else tab?.close();
        if (started.status.connected) show({ title: "Google Drive connected" });
      },
      onError: (error) => {
        tab?.close();
        failed("Could not connect")(error);
      },
    });
  };

  const run = (kind: "sync" | "upload" | "download") => {
    transfer.mutate(kind, {
      onSuccess: (result) => {
        const parts: string[] = [];
        if (result.download !== undefined) parts.push(downloadSummary(result.download));
        if (result.upload !== undefined) parts.push(`Uploaded ${formatBytes(result.upload.size)}.`);
        show({
          title: kind === "sync" ? "Synced" : kind === "upload" ? "Uploaded" : "Downloaded",
          description: parts.join(" "),
        });
        void devices.refetch();
      },
      onError: failed(kind === "sync" ? "Could not sync" : `Could not ${kind}`),
    });
  };

  const busy = transfer.isPending;
  return (
    <section aria-labelledby="data-cloud" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 id="data-cloud" className="text-lg font-semibold tracking-tight">
            Google Drive sync
          </h2>
          <p className="text-sm text-text-muted">
            Keeps your PCs and the phone app in step through your own Google Drive. Each device
            keeps one file in a hidden PlanBox folder there. Sync merges the other devices&apos;
            changes into this one (for each item the newer version wins, deletions included), then
            uploads this device&apos;s.
          </p>
        </div>
        {connected && (
          <Button
            variant="primary"
            onClick={() => {
              run("sync");
            }}
            disabled={busy}
          >
            {busy && transfer.variables === "sync" ? "Syncing…" : "Sync now"}
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4 text-sm">
        {data === undefined ? null : !data.available ? (
          IS_DEVICE ? (
            <p className="text-text-muted">Sync works in the PlanBox Android app.</p>
          ) : (
            <p className="text-text-muted">
              Not set up on this PC. Create a Google OAuth client (see the README, &quot;Google
              Drive sync&quot;), add <code className="font-mono">google_client_id</code> and{" "}
              <code className="font-mono">google_client_secret</code> to{" "}
              <code className="font-mono">private_data/settings.toml</code> and restart PlanBox.
            </p>
          )
        ) : !connected ? (
          <div className="flex flex-col gap-2">
            <p>
              {data.connecting
                ? "Finish signing in to Google in the tab that opened, then come back here."
                : "Not connected. Sign in with the Google account whose Drive should hold the sync files."}
            </p>
            {data.error !== null && <p className="text-danger">{data.error}</p>}
            <div>
              <Button variant="primary" onClick={startConnect} disabled={connect.isPending}>
                {connect.isPending ? "Connecting…" : "Connect Google Drive"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-text-muted">This device</dt>
              <dd>{data.device_name}</dd>
              <dt className="text-text-muted">Last upload</dt>
              <dd>
                {data.last_upload_at === null
                  ? "Never"
                  : formatInstant(data.last_upload_at, timeZone)}
              </dd>
              <dt className="text-text-muted">Last download</dt>
              <dd>
                {data.last_download_at === null
                  ? "Never"
                  : formatInstant(data.last_download_at, timeZone)}
              </dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  run("upload");
                }}
                disabled={busy}
              >
                {busy && transfer.variables === "upload" ? "Uploading…" : "Upload only"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  run("download");
                }}
                disabled={busy}
              >
                {busy && transfer.variables === "download" ? "Downloading…" : "Download only"}
              </Button>
              <Button
                variant="ghost"
                disabled={disconnect.isPending || busy}
                onClick={() => {
                  disconnect.mutate(undefined, { onError: failed("Could not disconnect") });
                }}
              >
                Disconnect
              </Button>
            </div>
            {devices.data !== undefined && devices.data.length > 0 && (
              <div>
                <h3 className="mb-1 text-base font-semibold">Devices in Drive</h3>
                <ul aria-label="Devices in Google Drive" className="flex flex-col">
                  {devices.data.map((device) => (
                    <li
                      key={device.device_id}
                      className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
                    >
                      <span>
                        {device.name}
                        {device.this_device && (
                          <span className="text-text-muted"> (this device)</span>
                        )}
                      </span>
                      <span className="text-text-muted">
                        {formatInstant(device.uploaded_at, timeZone)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
