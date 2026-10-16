import { describe, expect, it } from "vitest";

import type { DeviceHost } from "../core/device/server";
import { openTestDevice, type TestDevice } from "./deviceTesting";

const TODO = "01990000-0000-7000-8000-000000000001";

interface DriveFile {
  id: string;
  name: string;
  content: Uint8Array;
  properties: Record<string, string>;
  modified: string;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Google Drive's app data folder, as far as PlanBox uses it, in memory. */
class FakeDrive {
  readonly files = new Map<string, DriveFile>();
  token = "token-1";
  private tick = 0;

  readonly fetch = async (request: Request): Promise<Response> => {
    if (request.headers.get("Authorization") !== `Bearer ${this.token}`) {
      return Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 });
    }
    const url = new URL(request.url);
    if (url.pathname === "/drive/v3/files" && request.method === "GET") {
      const needle = (url.searchParams.get("q") ?? "").split("'")[1] ?? "";
      return Response.json({
        files: [...this.files.values()]
          .filter((f) => f.name.includes(needle))
          .map((f) => ({
            id: f.id,
            name: f.name,
            modifiedTime: f.modified,
            size: String(f.content.length),
            appProperties: f.properties,
          })),
      });
    }
    if (url.pathname.startsWith("/drive/v3/files/") && url.searchParams.get("alt") === "media") {
      const file = this.files.get(url.pathname.split("/").at(-1) ?? "");
      return file === undefined
        ? new Response(null, { status: 404 })
        : new Response(file.content as BlobPart);
    }
    if (
      url.pathname.startsWith("/upload/drive/v3/files") &&
      url.searchParams.get("uploadType") === "multipart"
    ) {
      const boundary = (request.headers.get("Content-Type") ?? "").split("boundary=")[1] ?? "";
      const body = new Uint8Array(await request.arrayBuffer());
      const encoder = new TextEncoder();
      const separator = encoder.encode("\r\n\r\n");
      const metaStart = indexOf(body, separator) + 4;
      const metaEnd = indexOf(body, encoder.encode(`\r\n--${boundary}`), metaStart);
      const metadata = JSON.parse(new TextDecoder().decode(body.slice(metaStart, metaEnd))) as {
        name?: string;
        parents?: string[];
        appProperties: Record<string, string>;
      };
      const contentStart = indexOf(body, separator, metaEnd) + 4;
      const contentEnd = indexOf(body, encoder.encode(`\r\n--${boundary}--`), contentStart);
      const content = body.slice(contentStart, contentEnd);
      this.tick += 1;
      const modified = `2026-10-08T13:00:${String(this.tick).padStart(2, "0")}.000Z`;
      const existing = url.pathname.split("/").at(-1);
      if (request.method === "PATCH" && existing !== undefined && this.files.has(existing)) {
        const file = this.files.get(existing) as DriveFile;
        Object.assign(file, { content, properties: metadata.appProperties, modified });
        return Response.json({ id: file.id });
      }
      expect(metadata.parents).toEqual(["appDataFolder"]);
      const id = `file-${String(this.files.size + 1)}`;
      this.files.set(id, {
        id,
        name: metadata.name ?? "",
        content,
        properties: metadata.appProperties,
        modified,
      });
      return Response.json({ id });
    }
    return Response.json(
      { error: { message: `unexpected ${request.method} ${url.pathname}` } },
      { status: 404 },
    );
  };
}

/** The app's Google sign-in: it hands out the token Google issued it. */
function host(drive: FakeDrive, token = drive.token): DeviceHost {
  return {
    cloudAvailable: true,
    googleToken: () => Promise.resolve(token),
    dropGoogleToken: () => Promise.resolve(),
    signOutGoogle: () => Promise.resolve(),
    fetch: drive.fetch,
  };
}

async function connected(drive: FakeDrive, name: string): Promise<TestDevice> {
  const device = await openTestDevice({ host: host(drive), deviceName: name });
  const answer = await device.call("POST", "/api/cloud/connect", { confirm: true });
  expect(answer.status).toBe(200);
  return device;
}

describe("Google Drive sync on the device", () => {
  it("is unavailable outside the Android app", async () => {
    const device = await openTestDevice();
    expect((await device.call("GET", "/api/cloud")).body).toMatchObject({ available: false });
    const connect = await device.call("POST", "/api/cloud/connect", { confirm: true });
    expect(connect.status).toBe(409);
  });

  it("moves changes between two phones both ways", async () => {
    const drive = new FakeDrive();
    const first = await connected(drive, "First phone");
    const second = await connected(drive, "Second phone");

    await first.call("POST", "/api/todos/items", { id: TODO, title: "Buy milk" });
    const upload = await first.call<{ size: number }>("POST", "/api/cloud/sync", { confirm: true });
    expect(upload.status).toBe(200);
    const [file] = drive.files.values();
    expect(file?.name).toMatch(/^planbox-.+\.json\.gz$/);
    expect(file?.properties.planbox_name).toBe("First phone");

    const pulled = await second.call<{ download: { devices: { status: string }[] } }>(
      "POST",
      "/api/cloud/sync",
      { confirm: true },
    );
    expect(pulled.body.download.devices.map((d) => d.status)).toEqual(["merged"]);
    expect(
      (await second.call<{ title: string }>("GET", `/api/todos/items/${TODO}`)).body.title,
    ).toBe("Buy milk");

    second.clock.advance(60_000);
    await second.call("PATCH", `/api/todos/items/${TODO}`, { title: "Buy oat milk" });
    await second.call("POST", "/api/cloud/sync", { confirm: true });
    await first.call("POST", "/api/cloud/download", { confirm: true });
    expect(
      (await first.call<{ title: string }>("GET", `/api/todos/items/${TODO}`)).body.title,
    ).toBe("Buy oat milk");

    const devices = await first.call<{ name: string; this_device: boolean }[]>(
      "GET",
      "/api/cloud/devices",
    );
    expect(devices.body.map((d) => [d.name, d.this_device])).toEqual([
      ["First phone", true],
      ["Second phone", false],
    ]);
  });

  it("asks to connect again when Google keeps refusing the token", async () => {
    const drive = new FakeDrive();
    const phone = await connected(drive, "Phone");
    drive.token = "token-2"; // Google revoked the app's token.
    const answer = await phone.call<{ detail: string }>("POST", "/api/cloud/upload", {
      confirm: true,
    });
    expect(answer.status).toBe(409);
    expect(answer.body.detail).toMatch(/Connect again/);
    expect((await phone.call("GET", "/api/cloud")).body).toMatchObject({ connected: false });
  });
});
