/**
 * Numbered SQL migrations, the twin of `backend/planbox/core/db/migrations.py`.
 *
 * The device runs the backend's own `.sql` files (bundled at build time), so
 * the phone's schema and its `schema_migrations` checksums equal a PC's, and
 * exports move between them. Checksums are SHA-256 of the file with CRLF
 * turned into LF, as in Python.
 */
import type { Clock } from "./clock";
import type { Database } from "./db";
import { toIso } from "./time";

const FILENAME_RE = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const FK_OFF_DIRECTIVE = "-- planbox: foreign_keys=off";

const CREATE_BOOKKEEPING = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    owner TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (owner, version)
) STRICT
`;

/** Migrations are malformed, edited after applying, or fail. */
export class MigrationError extends Error {}

/** One owner's migration files: path → content (from `import.meta.glob`). */
export interface MigrationSource {
  owner: string;
  files: Readonly<Record<string, string>>;
}

/** One migration, loaded and checksummed. */
export interface Migration {
  owner: string;
  version: number;
  name: string;
  sql: string;
  checksum: string;
  foreignKeysOff: boolean;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Loads and validates an owner's migrations (versions 1..n without gaps). */
export async function discover(source: MigrationSource): Promise<Migration[]> {
  const migrations: Migration[] = [];
  const paths = Object.keys(source.files).sort((a, b) => (fileName(a) < fileName(b) ? -1 : 1));
  for (const path of paths) {
    const name = fileName(path);
    const match = FILENAME_RE.exec(name);
    if (match === null)
      throw new MigrationError(`${source.owner}: bad migration filename '${name}'`);
    const sql = (source.files[path] ?? "").replaceAll("\r\n", "\n");
    migrations.push({
      owner: source.owner,
      version: Number(match[1]),
      name: match[2] ?? "",
      sql,
      checksum: await sha256(sql),
      foreignKeysOff: sql.trimStart().startsWith(FK_OFF_DIRECTIVE),
    });
  }
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationError(`${source.owner}: migration versions must be 1..n without gaps`);
    }
  });
  return migrations;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function label(m: Migration): string {
  return `${m.owner}/${String(m.version).padStart(4, "0")}_${m.name}`;
}

function hasTable(db: Database, name: string): boolean {
  return (
    db.get("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?", [name]) !== undefined
  );
}

/** The highest applied version per owner. */
export function appliedVersions(db: Database): Record<string, number> {
  if (!hasTable(db, "schema_migrations")) return {};
  const result: Record<string, number> = {};
  for (const row of db.all(
    "SELECT owner, MAX(version) AS version FROM schema_migrations GROUP BY owner",
  )) {
    result[String(row.owner)] = Number(row.version);
  }
  return result;
}

/** Migrations not applied yet, in application order (sources order, then version). */
export async function pending(
  db: Database,
  sources: readonly MigrationSource[],
): Promise<Migration[]> {
  const applied = new Map<string, string>();
  if (hasTable(db, "schema_migrations")) {
    for (const row of db.all("SELECT owner, version, checksum FROM schema_migrations")) {
      applied.set(`${String(row.owner)}/${String(row.version)}`, String(row.checksum));
    }
  }
  const result: Migration[] = [];
  const owners = new Set(sources.map((s) => s.owner));
  for (const source of sources) {
    for (const migration of await discover(source)) {
      const key = `${migration.owner}/${String(migration.version)}`;
      const recorded = applied.get(key);
      applied.delete(key);
      if (recorded === undefined) result.push(migration);
      else if (recorded !== migration.checksum) {
        throw new MigrationError(`${label(migration)} was edited after it was applied.`);
      }
    }
  }
  const missing = [...applied.keys()].filter((key) => owners.has(key.split("/")[0] ?? ""));
  if (missing.length > 0)
    throw new MigrationError(`applied migrations missing: ${missing.join(", ")}`);
  return result;
}

/**
 * Applies every pending migration, each in its own transaction. When
 * anything is pending and the database already holds tables, `backup` runs
 * first.
 */
export async function migrate(
  db: Database,
  sources: readonly MigrationSource[],
  clock: Clock,
  backup?: () => Promise<void>,
): Promise<Migration[]> {
  const todo = await pending(db, sources);
  if (todo.length === 0) return [];
  const hasTables =
    db.get(
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    ) !== undefined;
  if (backup !== undefined && hasTables) await backup();
  db.script(CREATE_BOOKKEEPING);
  for (const migration of todo) apply(db, migration, clock);
  return todo;
}

function apply(db: Database, migration: Migration, clock: Clock): void {
  if (migration.foreignKeysOff) db.script("PRAGMA foreign_keys = OFF");
  try {
    db.script("BEGIN IMMEDIATE");
    try {
      db.script(migration.sql);
      if (migration.foreignKeysOff && db.all("PRAGMA foreign_key_check").length > 0) {
        throw new MigrationError(`${label(migration)} left foreign key violations`);
      }
      db.run(
        "INSERT INTO schema_migrations (owner, version, name, checksum, applied_at) " +
          "VALUES (:owner, :version, :name, :checksum, :applied_at)",
        {
          owner: migration.owner,
          version: migration.version,
          name: migration.name,
          checksum: migration.checksum,
          applied_at: toIso(clock.now()),
        },
      );
    } catch (error) {
      if (db.inTransaction) db.script("ROLLBACK");
      if (error instanceof MigrationError) throw error;
      throw new MigrationError(`${label(migration)} failed: ${String(error)}`);
    }
    db.script("COMMIT");
  } finally {
    if (migration.foreignKeysOff) db.script("PRAGMA foreign_keys = ON");
  }
}
