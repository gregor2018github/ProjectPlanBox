/**
 * Backups, export and merge-import on the device: the twin of
 * `backend/planbox/core/data/`. The merge is the sync rule (ARCHITECTURE §13):
 * per row the newer `updated_at` wins, deletes travel as tombstones, and an
 * exact tie is broken by the row's canonical JSON, written exactly as
 * Python's `json.dumps(..., separators=(",", ":"))` writes it, so a PC and
 * the phone pick the same winner.
 */
import type { components } from "../api/schema";
import { nowIso } from "./clock";
import { SqlError, type Database, type Value } from "./db";
import { Conflict, ValidationFailed } from "./errors";
import type { DeviceContext, Handlers } from "./server";
import { SearchService } from "./search";
import { instantMs, isoWeek, localDay, toIso } from "./time";

/** The export document (GET /api/data/export). */
export type ExportFile = components["schemas"]["ExportFile"];
/** What an import did. */
export type ImportOut = components["schemas"]["ImportOut"];
type TableMerge = components["schemas"]["TableMergeOut"];

const EXPORT_FORMAT = "planbox-export";
const DERIVED_TABLES = new Set(["schema_migrations", "core_search_sync"]);
const SYNC_COLUMNS = ["id", "updated_at", "deleted_at"];
const BACKUPS = "backups";
const BACKUP_NAME = /^planbox-(\d{8}T\d{9}Z)-([a-z][a-z0-9-]*)\.db$/;

/** How many backups of each label are kept. */
export const KEEP: Readonly<Record<string, number>> = {
  daily: 14,
  weekly: 8,
  manual: 10,
  "pre-import": 10,
  "pre-migration": 10,
};

interface TableShape {
  name: string;
  columns: string[];
  types: string[];
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Python's `json.dumps(values, separators=(",", ":"))` (ASCII-only output). */
export function pythonJson(values: readonly Value[]): string {
  return `[${values.map(pythonValue).join(",")}]`;
}

function pythonValue(value: Value): string {
  if (value === null) return "null";
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : pythonFloat(value);
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const ch = value.charAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20 || code > 0x7e) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

function pythonFloat(value: number): string {
  // Python's repr: shortest round-trip digits, exponent form outside 1e-4..1e16.
  const text = String(value);
  if (!text.includes("e")) return text;
  const [mantissa, exponent] = text.split("e") as [string, string];
  const sign = exponent.startsWith("-") ? "-" : "+";
  const digits = exponent.replace(/^[+-]/, "").padStart(2, "0");
  return `${mantissa}e${sign}${digits}`;
}

function fits(value: unknown, declared: string): boolean {
  if (value === null || declared === "ANY") return true;
  if (declared === "TEXT") return typeof value === "string";
  if (declared === "INTEGER") return typeof value === "number" && Number.isInteger(value);
  if (declared === "REAL") return typeof value === "number";
  return false;
}

class DataRepository {
  constructor(private readonly db: Database) {}

  tables(): TableShape[] {
    const names = this.db
      .all(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .map((r) => String(r.name));
    const shapes: TableShape[] = [];
    for (const name of names) {
      if (DERIVED_TABLES.has(name)) continue;
      const info = this.db.all(`PRAGMA table_info(${quote(name)})`);
      const columns = info.map((r) => String(r.name));
      if (SYNC_COLUMNS.every((c) => columns.includes(c))) {
        shapes.push({ name, columns, types: info.map((r) => String(r.type).toUpperCase()) });
      }
    }
    return shapes;
  }

  migrations(): { owner: string; version: number; checksum: string }[] {
    return this.db
      .all("SELECT owner, version, checksum FROM schema_migrations ORDER BY owner, version")
      .map((r) => ({
        owner: String(r.owner),
        version: Number(r.version),
        checksum: String(r.checksum),
      }));
  }

  rows(table: TableShape): Value[][] {
    return this.db.values(
      `SELECT ${table.columns.map(quote).join(", ")} FROM ${quote(table.name)} ORDER BY id`,
    );
  }

  insert(table: TableShape, values: readonly Value[]): void {
    this.db.run(
      `INSERT INTO ${quote(table.name)} (${table.columns.map(quote).join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`,
      values,
    );
  }

  replace(table: TableShape, values: readonly Value[]): void {
    const pairs = table.columns
      .map((c, i) => [c, values[i] ?? null] as const)
      .filter(([c]) => c !== "id");
    const id = values[table.columns.indexOf("id")] ?? null;
    this.db.run(
      `UPDATE ${quote(table.name)} SET ${pairs.map(([c]) => `${quote(c)} = ?`).join(", ")} WHERE id = ?`,
      [...pairs.map(([, v]) => v), id],
    );
  }

  deferForeignKeys(): void {
    this.db.run("PRAGMA defer_foreign_keys = ON");
  }

  foreignKeyViolations(): number {
    return this.db.all("PRAGMA foreign_key_check").length;
  }
}

// ------------------------------------------------------------------- backups

/** A backup's file name for a label and a UTC stamp. */
export function backupName(label: string, stamp: string): string {
  return `planbox-${stamp.replaceAll("-", "").replaceAll(":", "").replaceAll(".", "")}-${label}.db`;
}

interface BackupFile {
  name: string;
  label: string;
  takenAt: string;
  size: number;
}

/** The backups on this device, newest first. */
export async function listBackups(ctx: DeviceContext): Promise<BackupFile[]> {
  const found: BackupFile[] = [];
  for (const file of await ctx.files.list(BACKUPS)) {
    const match = BACKUP_NAME.exec(file.name);
    if (match === null) continue;
    const s = match[1] ?? "";
    const takenAt = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.${s.slice(15, 18)}Z`;
    found.push({ name: file.name, label: match[2] ?? "", takenAt, size: file.size });
  }
  return found.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** Writes a copy of the database and prunes old copies with the same label. */
export async function takeBackup(ctx: DeviceContext, label: string): Promise<BackupFile> {
  const stamp = nowIso(ctx.clock);
  const name = backupName(label, stamp);
  const bytes = ctx.db.exportBytes();
  await ctx.files.write(BACKUPS, name, bytes);
  const keep = KEEP[label] ?? 10;
  const same = (await listBackups(ctx)).filter((b) => b.label === label);
  for (const old of same.slice(keep)) await ctx.files.remove(BACKUPS, old.name);
  return { name, label, takenAt: stamp, size: bytes.length };
}

/** Takes the daily and weekly backups when due (by local date); returns the labels taken. */
export async function runBackupSchedule(ctx: DeviceContext): Promise<string[]> {
  const today = localDay(ctx.clock.now(), ctx.zone);
  const taken: string[] = [];
  const backups = await listBackups(ctx);
  for (const label of ["daily", "weekly"]) {
    const latest = backups.find((b) => b.label === label);
    const day = latest === undefined ? null : localDay(instantMs(latest.takenAt), ctx.zone);
    const same =
      day !== null &&
      (label === "daily" ? day === today : isoWeek(day).join() === isoWeek(today).join());
    if (!same) {
      await takeBackup(ctx, label);
      taken.push(label);
    }
  }
  return taken;
}

// ------------------------------------------------------------- export/import

/** Every synced table with all its rows, tombstones included. */
export function exportData(ctx: DeviceContext): ExportFile {
  const repo = new DataRepository(ctx.db);
  return ctx.db.transaction(() => ({
    format: EXPORT_FORMAT,
    format_version: 1,
    app_version: ctx.version,
    exported_at: nowIso(ctx.clock),
    migrations: repo.migrations(),
    tables: Object.fromEntries(
      repo.tables().map((t) => [t.name, { columns: t.columns, rows: repo.rows(t) }]),
    ),
  }));
}

/** Merges an export: per row, the newer version wins. A backup is taken first. */
export async function importData(ctx: DeviceContext, data: ExportFile): Promise<ImportOut> {
  const repo = new DataRepository(ctx.db);
  const mine = JSON.stringify(repo.migrations());
  const theirs = JSON.stringify(
    data.migrations.map((m) => ({ owner: m.owner, version: m.version, checksum: m.checksum })),
  );
  if (mine !== theirs) {
    throw new Conflict(
      `The export was written by PlanBox ${data.app_version} with a different database version than ` +
        `this one (${ctx.version}). Update both devices to the same version and export again.`,
    );
  }
  const shapes = new Map(repo.tables().map((t) => [t.name, t]));
  for (const [name, dump] of Object.entries(data.tables)) {
    const shape = shapes.get(name);
    if (shape === undefined)
      throw new ValidationFailed(`The export has an unknown table '${name}'.`);
    if ([...dump.columns].sort().join() !== [...shape.columns].sort().join()) {
      throw new ValidationFailed(`The export's columns for '${name}' do not match.`);
    }
    const declared = dump.columns.map((c) => shape.types[shape.columns.indexOf(c)] ?? "");
    for (const row of dump.rows) {
      if (row.length !== declared.length || !row.every((v, i) => fits(v, declared[i] ?? ""))) {
        throw new ValidationFailed(`The export has a malformed row in '${name}'.`);
      }
    }
  }
  const backup = await takeBackup(ctx, "pre-import");
  const now = nowIso(ctx.clock);
  const merges: TableMerge[] = [];
  try {
    ctx.db.transaction(() => {
      repo.deferForeignKeys();
      for (const name of Object.keys(data.tables).sort()) {
        const shape = shapes.get(name);
        const dump = data.tables[name];
        if (shape !== undefined && dump !== undefined)
          merges.push(mergeTable(repo, shape, dump, now));
      }
      const missing = repo.foreignKeyViolations();
      if (missing > 0) {
        throw new ValidationFailed(
          `The export has ${String(missing)} row(s) that point at rows it does not contain.`,
        );
      }
    });
  } catch (error) {
    if (error instanceof SqlError && error.constraint !== null) {
      throw new ValidationFailed(`The export holds a value this PlanBox rejects: ${error.message}`);
    }
    throw error;
  }
  new SearchService(ctx.db, ctx.registry, ctx.clock).rebuild();
  return { backup: backup.name, tables: merges };
}

function mergeTable(
  repo: DataRepository,
  shape: TableShape,
  dump: { columns: string[]; rows: Value[][] },
  now: string,
): TableMerge {
  const order = shape.columns.map((c) => dump.columns.indexOf(c));
  const incoming = dump.rows.map((row) => order.map((i) => row[i] ?? null));
  const idAt = shape.columns.indexOf("id");
  const updatedAt = shape.columns.indexOf("updated_at");
  const local = new Map(repo.rows(shape).map((row) => [row[idAt], row]));
  const merge: TableMerge = {
    table: shape.name,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    conflicts: 0,
  };

  // Updates first: a row deleted on the other device leaves its unique slot
  // before a row that is new here may take it.
  const news: Value[][] = [];
  for (const row of incoming) {
    const mine = local.get(row[idAt] ?? null);
    if (mine === undefined) {
      news.push(row);
    } else if (newer(row, mine, updatedAt)) {
      write(repo, shape, row, merge, now, true);
      merge.updated += 1;
    } else {
      merge.unchanged += 1;
    }
  }
  for (const row of news) {
    write(repo, shape, row, merge, now, false);
    merge.inserted += 1;
  }
  return merge;
}

function newer(row: Value[], mine: Value[], updatedAt: number): boolean {
  const a = String(row[updatedAt]);
  const b = String(mine[updatedAt]);
  if (a !== b) return a > b;
  return pythonJson(row) > pythonJson(mine);
}

function write(
  repo: DataRepository,
  shape: TableShape,
  row: Value[],
  merge: TableMerge,
  now: string,
  exists: boolean,
): void {
  const apply = (values: Value[]) => {
    if (exists) repo.replace(shape, values);
    else repo.insert(shape, values);
  };
  try {
    apply(row);
  } catch (error) {
    const deletedAt = shape.columns.indexOf("deleted_at");
    if (!(error instanceof SqlError) || error.constraint !== "UNIQUE" || row[deletedAt] !== null)
      throw error;
    // Both devices made the same thing (a tag name, a day's check-in): keep
    // the one here, store the other deleted with a stamp newer than its version.
    const later = toIso(instantMs(String(row[shape.columns.indexOf("updated_at")])) + 1);
    const stamp = now > later ? now : later;
    apply(
      shape.columns.map((c, i) =>
        c === "deleted_at" || c === "updated_at" ? stamp : (row[i] ?? null),
      ),
    );
    merge.conflicts += 1;
  }
}

/** `/api/data`. */
export const dataHandlers: Handlers = {
  core_list_backups: async (_, ctx) => ({
    backups: (await listBackups(ctx)).map((b) => ({
      name: b.name,
      label: b.label,
      taken_at: b.takenAt,
      size: b.size,
    })),
    offsite: null,
    scheduled: true,
  }),
  core_create_backup: async (_, ctx) => {
    const b = await takeBackup(ctx, "manual");
    return { name: b.name, label: b.label, taken_at: b.takenAt, size: b.size };
  },
  core_export_data: (_, ctx) => exportData(ctx),
  core_import_data: ({ body }, ctx) => importData(ctx, body),
};
