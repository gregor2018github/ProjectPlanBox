/**
 * The device database: one SQLite (WebAssembly) connection with PlanBox's
 * settings and Python-like helpers. Repositories use `run`/`get`/`all`;
 * services wrap use cases in `transaction`, which joins an open one, like
 * `core.db.transaction()`.
 */
import type { Database as RawDatabase, Sqlite3Static, SqlValue } from "@sqlite.org/sqlite-wasm";

/** A column value as PlanBox stores it (no BLOBs). */
export type Value = string | number | null;

/** Statement parameters: positional, or named without the `:` prefix. */
export type Params = readonly Value[] | Readonly<Record<string, Value>>;

/** A result row by column name. */
export type Row = Record<string, Value>;

/** A failed statement; `constraint` is set for constraint violations (UNIQUE, CHECK, FK). */
export class SqlError extends Error {
  constructor(
    message: string,
    readonly constraint: string | null,
  ) {
    super(message);
    this.name = "SqlError";
  }
}

const SQLITE_CONSTRAINT = 19;

function bind(params: Params | undefined): SqlValue[] | Record<string, SqlValue> | undefined {
  if (params === undefined) return undefined;
  if (Array.isArray(params)) return params as SqlValue[];
  const named: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(params as Record<string, Value>)) {
    named[`:${key}`] = value;
  }
  return named;
}

function normalize(value: unknown): Value {
  if (typeof value === "bigint") return Number(value);
  if (value === undefined) return null;
  return value as Value;
}

function wrap(error: unknown): never {
  if (error instanceof Error && "resultCode" in error) {
    const code = Number((error as { resultCode: unknown }).resultCode);
    if (code % 256 === SQLITE_CONSTRAINT) {
      const match = /(UNIQUE|CHECK|NOT NULL|FOREIGN KEY) constraint failed/.exec(error.message);
      throw new SqlError(error.message, match?.[1] ?? "CONSTRAINT");
    }
    throw new SqlError(error.message, null);
  }
  throw error;
}

/** A connection with PlanBox's per-connection settings. */
export class Database {
  constructor(
    readonly raw: RawDatabase,
    private readonly sqlite3: Sqlite3Static,
  ) {
    this.raw.exec("PRAGMA foreign_keys = ON");
  }

  /** Runs one statement; returns how many rows it changed. */
  run(sql: string, params?: Params): number {
    try {
      this.raw.exec({ sql, bind: bind(params) });
      return this.raw.changes();
    } catch (error) {
      return wrap(error);
    }
  }

  /** Every row of a query, by column name. */
  all(sql: string, params?: Params): Row[] {
    try {
      const rows = this.raw.exec({
        sql,
        bind: bind(params),
        rowMode: "object",
        returnValue: "resultRows",
      });
      return rows.map((row) => {
        const out: Row = {};
        for (const [key, value] of Object.entries(row)) out[key] = normalize(value);
        return out;
      });
    } catch (error) {
      return wrap(error);
    }
  }

  /** Every row of a query as value lists (column order). */
  values(sql: string, params?: Params): Value[][] {
    try {
      const rows = this.raw.exec({
        sql,
        bind: bind(params),
        rowMode: "array",
        returnValue: "resultRows",
      });
      return rows.map((row) => row.map(normalize));
    } catch (error) {
      return wrap(error);
    }
  }

  /** The first row of a query, if any. */
  get(sql: string, params?: Params): Row | undefined {
    return this.all(sql, params)[0];
  }

  /** Runs a script of several statements (migrations). */
  script(sql: string): void {
    try {
      this.raw.exec(sql);
    } catch (error) {
      wrap(error);
    }
  }

  /** Whether a transaction is open. */
  get inTransaction(): boolean {
    return this.sqlite3.capi.sqlite3_get_autocommit(this.raw) === 0;
  }

  /**
   * Runs `work` in a `BEGIN IMMEDIATE` transaction: commits on success,
   * rolls back on any error. Inside an open transaction it joins it.
   */
  transaction<T>(work: () => T): T {
    if (this.inTransaction) return work();
    this.raw.exec("BEGIN IMMEDIATE");
    let result: T;
    try {
      result = work();
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
    this.raw.exec("COMMIT");
    return result;
  }

  /** The whole database file (for backups). */
  exportBytes(): Uint8Array {
    return this.sqlite3.capi.sqlite3_js_db_export(this.raw);
  }
}

/** `?, ?, ?` for a list of values. */
export function marks(values: readonly unknown[]): string {
  return values.map(() => "?").join(",");
}

/** Splits a list so SQLite's limit on bound parameters is never reached. */
export function chunks<T>(values: readonly T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/** A stored text value. */
export function text(row: Row, column: string): string {
  return String(row[column]);
}

/** A stored nullable text value. */
export function textOrNull(row: Row, column: string): string | null {
  const value = row[column];
  return value === null || value === undefined ? null : String(value);
}

/** A stored integer value. */
export function int(row: Row, column: string): number {
  return Number(row[column]);
}
