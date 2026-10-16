/**
 * Test helpers for the device backend: the whole backend on an in-memory
 * SQLite database, a fixed clock and in-memory files. Used by tests only.
 */
import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import { createDeviceApp, type DeviceApp } from "../core/device/app";
import { FixedClock } from "../core/device/clock";
import { MemoryFiles } from "../core/device/memoryFiles";
import type { DeviceHost } from "../core/device/server";
import { DEVICE_MODULES } from "./device";

let sqlite3: Promise<Sqlite3Static> | null = null;

/** 2026-10-08 12:00 UTC, the backend tests' fixed start. */
export const START = Date.UTC(2026, 9, 8, 12, 0, 0);

/** A host without Google sign-in (a plain browser). */
export const NO_CLOUD: DeviceHost = {
  cloudAvailable: false,
  googleToken: () => Promise.resolve(null),
  dropGoogleToken: () => Promise.resolve(),
  signOutGoogle: () => Promise.resolve(),
  fetch: (request) => fetch(request),
};

/** A test device: its app, clock and a JSON helper over its `fetch`. */
export interface TestDevice extends DeviceApp {
  clock: FixedClock;
  files: MemoryFiles;
  /** Sends a request; returns the status and the parsed JSON body. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- tests name the answer type
  call: <T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
  ) => Promise<{ status: number; body: T }>;
}

/** Opens a fresh device backend. */
export async function openTestDevice(
  options: { host?: DeviceHost; files?: MemoryFiles; clock?: FixedClock; deviceName?: string } = {},
): Promise<TestDevice> {
  sqlite3 ??= sqlite3InitModule();
  const lib = await sqlite3;
  const clock = options.clock ?? new FixedClock(START);
  const files = options.files ?? new MemoryFiles();
  const app = await createDeviceApp({
    raw: new lib.oo1.DB(":memory:", "c"),
    sqlite3: lib,
    modules: DEVICE_MODULES,
    clock,
    zone: "Europe/Amsterdam",
    version: "0.0.0-test",
    deviceName: options.deviceName ?? "Test phone",
    files,
    host: options.host ?? NO_CLOUD,
  });
  const call: TestDevice["call"] = async (method, path, body) => {
    const response = await app.server.fetch(
      new Request(`http://device${path}`, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as never };
  };
  return { ...app, clock, files, call };
}
