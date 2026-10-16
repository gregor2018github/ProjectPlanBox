/**
 * The phone app's backend, in a Web Worker: SQLite (WebAssembly) on the
 * origin private file system, the device twin of the server, and the
 * scheduled backups. The page talks to it through `bridge.ts`.
 */
/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import { createDeviceApp, type DeviceApp } from "../../core/device/app";
import { systemClock } from "../../core/device/clock";
import { runBackupSchedule } from "../../core/device/data";
import { OpfsFiles } from "../../core/device/opfsFiles";
import type { DeviceHost } from "../../core/device/server";
import { DEVICE_MODULES } from "../../modules/device";
import type { DeviceRequest, FromWorker, HostCall, ToWorker } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

/** The configured zone; the PC's default, so "today" agrees on every device. */
const ZONE = "Europe/Amsterdam";
const BACKUP_CHECK_MS = 3_600_000;

const post = (message: FromWorker) => {
  self.postMessage(message);
};

let app: DeviceApp | null = null;
const waiting: DeviceRequest[] = [];
const replies = new Map<
  number,
  (reply: { ok: boolean; value?: unknown; error?: string }) => void
>();
let nextCall = 1;

function callHost(name: HostCall["name"], args: unknown[]): Promise<unknown> {
  const id = nextCall;
  nextCall += 1;
  return new Promise((resolve, reject) => {
    replies.set(id, (reply) => {
      if (reply.ok) resolve(reply.value);
      else reject(new Error(reply.error ?? "failed"));
    });
    post({ type: "host-call", id, name, args });
  });
}

async function serve(request: DeviceRequest): Promise<void> {
  if (app === null) {
    waiting.push(request);
    return;
  }
  const response = await app.server.fetch(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }),
  );
  post({
    type: "response",
    id: request.id,
    status: response.status,
    headers: [...response.headers.entries()],
    body: await response.text(),
  });
}

async function start(cloudAvailable: boolean, deviceName: string): Promise<void> {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: "planbox-sahpool",
    directory: ".planbox-db",
  });
  const host: DeviceHost = {
    cloudAvailable,
    googleToken: async (interactive) => {
      const token = await callHost("googleToken", [interactive]);
      return typeof token === "string" ? token : null;
    },
    dropGoogleToken: async (token) => {
      await callHost("dropGoogleToken", [token]);
    },
    signOutGoogle: async () => {
      await callHost("signOutGoogle", []);
    },
    fetch: (request) => fetch(request),
  };
  const files = new OpfsFiles();
  app = await createDeviceApp({
    raw: new pool.OpfsSAHPoolDb("/planbox.db"),
    sqlite3,
    modules: DEVICE_MODULES,
    clock: systemClock,
    zone: ZONE,
    version: __APP_VERSION__,
    deviceName,
    files,
    host,
  });
  post({ type: "ready" });
  for (const request of waiting.splice(0)) void serve(request);

  const opened = app;
  const backUp = () => {
    runBackupSchedule(opened.ctx).catch((error: unknown) => {
      // A failed backup never stops the app; the next check retries.
      console.error("PlanBox: scheduled backup failed", error);
    });
  };
  backUp();
  setInterval(backUp, BACKUP_CHECK_MS);
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case "start":
      start(message.cloudAvailable, message.deviceName).catch((error: unknown) => {
        console.error("PlanBox: the device database did not open", error);
        post({ type: "failed", message: error instanceof Error ? error.message : String(error) });
      });
      break;
    case "request":
      void serve(message);
      break;
    case "host-reply":
      replies.get(message.id)?.(message);
      replies.delete(message.id);
      break;
  }
};
