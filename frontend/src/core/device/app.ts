/**
 * Builds the device backend: migrations, the entity registry and every
 * handler, the twin of `create_app()` in `backend/planbox/main.py`.
 */
import type { Database as RawDatabase, Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import type { Clock } from "./clock";
import { cloudHandlers } from "./cloud";
import { dataHandlers, takeBackup } from "./data";
import { Database } from "./db";
import { EntityRegistry } from "./entities";
import { insightHandlers } from "./insights";
import { linkHandlers } from "./links";
import { metaHandlers } from "./meta";
import { migrate, type MigrationSource } from "./migrations";
import { searchHandlers } from "./search";
import {
  DeviceServer,
  type DeviceContext,
  type DeviceFiles,
  type DeviceHost,
  type DeviceModule,
  type Handlers,
} from "./server";
import { tagHandlers } from "./tags";

/** Core's own migrations: the backend's files, bundled. */
const CORE_MIGRATIONS: MigrationSource = {
  owner: "core",
  files: import.meta.glob<string>("../../../../backend/planbox/core/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

const CORE_HANDLERS: Handlers = {
  ...metaHandlers,
  ...tagHandlers,
  ...linkHandlers,
  ...searchHandlers,
  ...insightHandlers,
  ...dataHandlers,
  ...cloudHandlers,
};

/** What the device backend is built from. */
export interface DeviceAppOptions {
  raw: RawDatabase;
  sqlite3: Sqlite3Static;
  modules: readonly DeviceModule[];
  clock: Clock;
  zone: string;
  version: string;
  deviceName: string;
  files: DeviceFiles;
  host: DeviceHost;
}

/** A running device backend. */
export interface DeviceApp {
  server: DeviceServer;
  ctx: DeviceContext;
}

/** Opens the backend: applies pending migrations (with a backup first), then serves. */
export async function createDeviceApp(options: DeviceAppOptions): Promise<DeviceApp> {
  const ids = options.modules.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate module ids: ${ids.join(", ")}`);
  const db = new Database(options.raw, options.sqlite3);
  const ctx: DeviceContext = {
    db,
    clock: options.clock,
    zone: options.zone,
    registry: new EntityRegistry(options.modules.flatMap((m) => m.entityTypes)),
    version: options.version,
    deviceName: options.deviceName,
    files: options.files,
    host: options.host,
  };
  await migrate(
    db,
    [CORE_MIGRATIONS, ...options.modules.map((m) => m.migrations)],
    options.clock,
    async () => {
      await takeBackup(ctx, "pre-migration");
    },
  );
  const handlers: Handlers = { ...CORE_HANDLERS };
  for (const module of options.modules) Object.assign(handlers, module.handlers);
  return { server: new DeviceServer(ctx, handlers), ctx };
}

/** Operation ids served on the PC only; every other one needs a device handler. */
export const PC_ONLY_OPERATIONS: readonly string[] = [];
