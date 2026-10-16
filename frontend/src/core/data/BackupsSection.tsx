import { useMeta } from "../api/coreQueries";
import { IS_DEVICE } from "../platform";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/useToast";
import { useBackUpNow, useBackups } from "./dataQueries";
import { backupLabel, formatBytes, formatInstant } from "./format";

/** The Data page's backup block: the off-site folder, "Back up now", and the list. */
export function BackupsSection() {
  const backups = useBackups();
  const backUpNow = useBackUpNow();
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const { show } = useToast();
  const data = backups.data;

  const backUp = () => {
    backUpNow.mutate(undefined, {
      onSuccess: (backup) => {
        show({ title: "Backup saved", description: backup.name });
      },
      onError: (error) => {
        show({ title: "Could not back up", description: error.message, tone: "error" });
      },
    });
  };

  return (
    <section aria-labelledby="data-backups" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 id="data-backups" className="text-lg font-semibold tracking-tight">
            Backups
          </h2>
          <p className="text-sm text-text-muted">
            {data?.scheduled === false
              ? "Daily and weekly backups run in the daily app (py main.py), not here."
              : IS_DEVICE
                ? "The app backs up once a day and once a week while it is open, and keeps the last 14 daily and 8 weekly backups. For a copy off the phone, sync with Google Drive."
                : "PlanBox backs up once a day and once a week while it runs, and keeps the last 14 daily and 8 weekly backups."}
          </p>
        </div>
        <Button variant="primary" onClick={backUp} disabled={backUpNow.isPending}>
          {backUpNow.isPending ? "Backing up…" : "Back up now"}
        </Button>
      </header>

      {!IS_DEVICE && (
        <div className="flex flex-col gap-1 rounded-lg bg-surface p-4 text-sm">
          <h3 className="text-base font-semibold">Off-site copy</h3>
          {data === undefined ? null : data.offsite === null ? (
            <p className="text-text-muted">
              Not set up. Backups live on this disk only, so they would not survive losing it. Add{" "}
              <code className="font-mono">offsite_backup_dir = &quot;D:/PlanBox backups&quot;</code>{" "}
              (another disk, a USB stick or a synced cloud folder) to{" "}
              <code className="font-mono">private_data/settings.toml</code> and restart PlanBox.
            </p>
          ) : (
            <>
              <p className="font-mono break-all">{data.offsite.path}</p>
              {data.offsite.error !== null ? (
                <p className="text-danger">The last copy failed: {data.offsite.error}</p>
              ) : !data.offsite.reachable ? (
                <p className="text-warning">
                  Not reachable right now. Copies catch up once it is back.
                </p>
              ) : (
                <p className="text-text-muted">
                  {data.offsite.latest_at === null
                    ? "No copies yet."
                    : `Latest copy: ${formatInstant(data.offsite.latest_at, timeZone)}`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {data !== undefined && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-2 text-base font-semibold">
            {IS_DEVICE ? "On this phone" : "On this PC"}
          </h3>
          {data.backups.length === 0 ? (
            <p className="text-sm text-text-muted">No backups yet.</p>
          ) : (
            <ul
              aria-label={IS_DEVICE ? "Backups on this phone" : "Backups on this PC"}
              className="flex flex-col text-sm"
            >
              {data.backups.map((backup) => (
                <li
                  key={backup.name}
                  className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
                >
                  <span>{formatInstant(backup.taken_at, timeZone)}</span>
                  <span className="flex-1 text-text-muted">{backupLabel(backup.label)}</span>
                  <span className="text-text-muted tabular-nums">{formatBytes(backup.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
