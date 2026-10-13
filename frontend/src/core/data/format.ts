import type { ImportReport } from "../api/types";
import { formatDayShort, formatMinutes, zonedParts } from "../time";

/** Labels of backups as the page names them. */
const LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  manual: "Manual",
  "pre-import": "Before import",
  "pre-migration": "Before update",
};

/** A backup's reason in words; unknown labels pass through. */
export function backupLabel(label: string): string {
  return LABELS[label] ?? label;
}

/** A size as `512 B`, `48 KB` or `3.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** An instant as `Wed 8 Oct, 14:05` in the given zone. */
export function formatInstant(instant: string, timeZone: string): string {
  const { date, minutes } = zonedParts(instant, timeZone);
  return `${formatDayShort(date)}, ${formatMinutes(minutes)}`;
}

/** The download name for an export taken at `instant`: `planbox-export-20261013T140500000Z.json`. */
export function exportFileName(instant: string): string {
  return `planbox-export-${instant.replace(/[-:.]/g, "")}.json`;
}

/** One sentence on what an import changed. */
export function importSummary(report: ImportReport): string {
  const sum = (key: "inserted" | "updated" | "conflicts") =>
    report.tables.reduce((total, table) => total + table[key], 0);
  const inserted = sum("inserted");
  const updated = sum("updated");
  const conflicts = sum("conflicts");
  if (inserted + updated === 0) return "Nothing new: this PlanBox already had everything.";
  const parts = [`${String(inserted)} new`, `${String(updated)} updated`];
  const duplicates =
    conflicts > 0
      ? ` ${String(conflicts)} duplicate${conflicts === 1 ? " was" : "s were"} stored as deleted.`
      : "";
  return `${parts.join(", ")}.${duplicates}`;
}
