/**
 * Google Drive sync on the device: the twin of `backend/planbox/core/cloud/`.
 *
 * The same files in the same app data folder: every device keeps one export
 * (`planbox-<device id>.json.gz`), uploads replace it, downloads merge the
 * others'. Signing in is the Android app's job (Google Play services), so
 * this side only asks the host for an access token.
 */
import type { components } from "../api/schema";
import { newId } from "../ids";
import { nowIso } from "./clock";
import { Conflict, DomainError, UpstreamFailed, ValidationFailed } from "./errors";
import { exportData, importData, type ExportFile, type ImportOut } from "./data";
import { validateNamed } from "./openapi";
import type { DeviceContext, Handlers } from "./server";
import { parseInstant, toIso } from "./time";

type CloudStatus = components["schemas"]["CloudStatusOut"];
type CloudDevice = components["schemas"]["CloudDeviceOut"];
type CloudMerge = components["schemas"]["CloudMergeOut"];
type CloudUpload = components["schemas"]["CloudUploadOut"];

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_PREFIX = "planbox-";
const FILE_SUFFIX = ".json.gz";
const MAX_NAME = 60;
/** Drive takes metadata and content in one request up to 5 MB. */
const MULTIPART_LIMIT = 5 * 1024 * 1024;
const STATE = { folder: "state", name: "cloud.json" };

/** What the device remembers about sync (beside the database, never in it). */
interface CloudRecord {
  device_id: string;
  connected: boolean;
  last_upload_at: string | null;
  last_download_at: string | null;
  merged: Record<string, string>;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
  properties: Record<string, string>;
}

/** Google no longer accepts this device's sign-in, or it never connected. */
class SignedOut extends Conflict {}

let busy = false;
let lastError: string | null = null;

async function load(ctx: DeviceContext): Promise<CloudRecord> {
  const bytes = await ctx.files.read(STATE.folder, STATE.name);
  if (bytes !== null) {
    try {
      const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CloudRecord>;
      if (typeof raw.device_id === "string" && raw.device_id) {
        return {
          device_id: raw.device_id,
          connected: raw.connected === true,
          last_upload_at: raw.last_upload_at ?? null,
          last_download_at: raw.last_download_at ?? null,
          merged: raw.merged ?? {},
        };
      }
    } catch {
      // A damaged file starts over with a new id, as on the PC.
    }
  }
  const record: CloudRecord = {
    device_id: newId(),
    connected: false,
    last_upload_at: null,
    last_download_at: null,
    merged: {},
  };
  await save(ctx, record);
  return record;
}

async function save(ctx: DeviceContext, record: CloudRecord): Promise<void> {
  await ctx.files.write(
    STATE.folder,
    STATE.name,
    new TextEncoder().encode(JSON.stringify(record, null, 2)),
  );
}

async function update(ctx: DeviceContext, changes: Partial<CloudRecord>): Promise<CloudRecord> {
  const record = { ...(await load(ctx)), ...changes };
  await save(ctx, record);
  return record;
}

async function status(ctx: DeviceContext): Promise<CloudStatus> {
  const record = await load(ctx);
  return {
    available: ctx.host.cloudAvailable,
    connected: record.connected,
    connecting: false,
    device_id: record.device_id,
    device_name: ctx.deviceName,
    last_upload_at: record.last_upload_at,
    last_download_at: record.last_download_at,
    error: lastError,
  };
}

/** Runs bytes through a (de)compression stream. */
function gzip(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): ReadableStream<Uint8Array> {
  const source = new Response(bytes as BlobPart).body;
  if (source === null) throw new Error("no stream");
  return source.pipeThrough(transform);
}

/** gzip-compressed JSON of an export document. */
export async function pack(document: ExportFile): Promise<Uint8Array> {
  const stream = gzip(
    new TextEncoder().encode(JSON.stringify(document)),
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The export document in a downloaded file. */
export async function unpack(content: Uint8Array): Promise<ExportFile> {
  try {
    const stream = gzip(content, new DecompressionStream("gzip"));
    const parsed: unknown = JSON.parse(await new Response(stream).text());
    const { value, issues } = validateNamed("ExportFile", parsed);
    if (issues.length > 0) throw new Error("not an export");
    return value as ExportFile;
  } catch {
    throw new ValidationFailed("The file in Google Drive is not a PlanBox export.");
  }
}

function deviceOf(file: DriveFile, ownId: string): CloudDevice | null {
  if (!file.name.startsWith(FILE_PREFIX) || !file.name.endsWith(FILE_SUFFIX)) return null;
  const deviceId = file.name.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
  const parsed = parseInstant(file.modifiedTime);
  return {
    device_id: deviceId,
    name: file.properties.planbox_name ?? "Unnamed device",
    uploaded_at: parsed === null ? file.modifiedTime : toIso(parsed.ms),
    exported_at: file.properties.planbox_exported_at ?? null,
    app_version: file.properties.planbox_app_version ?? null,
    size: file.size,
    this_device: deviceId === ownId,
  };
}

/** Drive's app data folder with one token; a rejected token is renewed once. */
class Drive {
  private token: string | null = null;

  constructor(private readonly ctx: DeviceContext) {}

  private async send(
    method: string,
    url: string,
    body?: BodyInit,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      this.token ??= await this.ctx.host.googleToken(false);
      if (this.token === null) throw new SignedOut("Connect Google Drive first.");
      let answer: Response;
      try {
        answer = await this.ctx.host.fetch(
          new Request(url, {
            method,
            body,
            headers: { Authorization: `Bearer ${this.token}`, ...headers },
          }),
        );
      } catch (error) {
        throw new UpstreamFailed(`Google could not be reached (${String(error)}).`);
      }
      if (answer.status === 401) {
        await this.ctx.host.dropGoogleToken(this.token);
        this.token = null;
        continue;
      }
      if (answer.status >= 300) {
        throw new UpstreamFailed(`Google Drive refused the request (${await errorText(answer)}).`);
      }
      return answer;
    }
    await update(this.ctx, { connected: false });
    throw new SignedOut("Google Drive signed PlanBox out. Connect again.");
  }

  async list(prefix: string): Promise<DriveFile[]> {
    const found: DriveFile[] = [];
    let page: string | null = null;
    for (;;) {
      const query = new URLSearchParams({
        spaces: "appDataFolder",
        q: `name contains '${prefix}' and trashed = false`,
        fields: "nextPageToken,files(id,name,modifiedTime,size,appProperties)",
        pageSize: "100",
        ...(page === null ? {} : { pageToken: page }),
      });
      const data = (await (await this.send("GET", `${FILES_URL}?${query.toString()}`)).json()) as {
        files?: {
          id?: string;
          name?: string;
          modifiedTime?: string;
          size?: string;
          appProperties?: Record<string, string>;
        }[];
        nextPageToken?: string;
      };
      for (const item of data.files ?? []) {
        if (item.id && item.name?.startsWith(prefix) && item.modifiedTime) {
          found.push({
            id: item.id,
            name: item.name,
            modifiedTime: item.modifiedTime,
            size: Number(item.size ?? "0") || 0,
            properties: item.appProperties ?? {},
          });
        }
      }
      if (data.nextPageToken === undefined) return found;
      page = data.nextPageToken;
    }
  }

  async download(id: string): Promise<Uint8Array> {
    const answer = await this.send("GET", `${FILES_URL}/${encodeURIComponent(id)}?alt=media`);
    return new Uint8Array(await answer.arrayBuffer());
  }

  async upload(
    name: string,
    content: Uint8Array,
    properties: Record<string, string>,
    existing: string | null,
  ): Promise<void> {
    const metadata: Record<string, unknown> = { appProperties: properties };
    let method = "POST";
    let url = UPLOAD_URL;
    if (existing === null) {
      metadata.name = name;
      metadata.parents = ["appDataFolder"];
    } else {
      method = "PATCH";
      url = `${UPLOAD_URL}/${encodeURIComponent(existing)}`;
    }
    if (content.length <= MULTIPART_LIMIT) {
      // One request (metadata and content), which a WebView may send to
      // Google without reading any response header.
      const boundary = `planbox${newId().replaceAll("-", "")}`;
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
        content as BlobPart,
        `\r\n--${boundary}--`,
      ]);
      await this.send(method, `${url}?uploadType=multipart&fields=id`, body, {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      });
      return;
    }
    const start = await this.send(
      method,
      `${url}?uploadType=resumable&fields=id,name,modifiedTime,size`,
      JSON.stringify(metadata),
      {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/gzip",
        "X-Upload-Content-Length": String(content.length),
      },
    );
    const session = start.headers.get("location");
    if (!session) throw new UpstreamFailed("Google Drive did not start the upload.");
    await this.send("PUT", session, new Blob([content as BlobPart]), {
      "Content-Type": "application/gzip",
    });
  }
}

async function errorText(answer: Response): Promise<string> {
  try {
    const data = (await answer.json()) as {
      error?: { message?: string } | string;
      error_description?: string;
    };
    if (typeof data.error === "object")
      return data.error.message ?? `HTTP ${String(answer.status)}`;
    return data.error_description ?? data.error ?? `HTTP ${String(answer.status)}`;
  } catch {
    return `HTTP ${String(answer.status)}`;
  }
}

async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new Conflict("A sync is already running. Try again in a moment.");
  busy = true;
  try {
    return await work();
  } finally {
    busy = false;
  }
}

async function upload(ctx: DeviceContext, drive: Drive): Promise<CloudUpload> {
  const record = await load(ctx);
  const document = exportData(ctx);
  const content = await pack(document);
  const name = `${FILE_PREFIX}${record.device_id}${FILE_SUFFIX}`;
  const existing = (await drive.list(name)).find((f) => f.name === name)?.id ?? null;
  await drive.upload(
    name,
    content,
    {
      planbox_name: ctx.deviceName.slice(0, MAX_NAME),
      planbox_exported_at: document.exported_at,
      planbox_app_version: ctx.version,
    },
    existing,
  );
  const now = nowIso(ctx.clock);
  await update(ctx, { last_upload_at: now });
  return { uploaded_at: now, size: content.length };
}

async function download(ctx: DeviceContext, drive: Drive): Promise<{ devices: CloudMerge[] }> {
  const record = await load(ctx);
  const merged = { ...record.merged };
  const results: CloudMerge[] = [];
  for (const file of await drive.list(FILE_PREFIX)) {
    const device = deviceOf(file, record.device_id);
    if (device === null || device.this_device) continue;
    if (merged[device.device_id] === file.modifiedTime) {
      results.push({ device, status: "unchanged", error: null, result: null });
      continue;
    }
    let result: ImportOut;
    try {
      result = await importData(ctx, await unpack(await drive.download(file.id)));
    } catch (error) {
      if (
        error instanceof DomainError &&
        !(error instanceof UpstreamFailed) &&
        !(error instanceof SignedOut)
      ) {
        results.push({ device, status: "failed", error: error.detail, result: null });
        continue;
      }
      throw error;
    }
    merged[device.device_id] = file.modifiedTime;
    results.push({ device, status: "merged", error: null, result });
  }
  await update(ctx, { merged, last_download_at: nowIso(ctx.clock) });
  results.sort((a, b) => {
    const an = a.device.name.toLowerCase();
    const bn = b.device.name.toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : a.device.device_id < b.device.device_id ? -1 : 1;
  });
  return { devices: results };
}

function requireConnected(record: CloudRecord): void {
  if (!record.connected) throw new SignedOut("Connect Google Drive first.");
}

/** `/api/cloud`. */
export const cloudHandlers: Handlers = {
  core_get_cloud: (_, ctx) => status(ctx),
  core_list_cloud_devices: async (_, ctx) => {
    const record = await load(ctx);
    requireConnected(record);
    const found = (await new Drive(ctx).list(FILE_PREFIX))
      .map((f) => deviceOf(f, record.device_id))
      .filter((d): d is CloudDevice => d !== null);
    return found.sort((a, b) =>
      a.this_device !== b.this_device
        ? a.this_device
          ? -1
          : 1
        : a.name.toLowerCase() < b.name.toLowerCase()
          ? -1
          : 1,
    );
  },
  core_connect_cloud: async (_, ctx) => {
    if (!ctx.host.cloudAvailable) {
      throw new Conflict("Google Drive sync needs the PlanBox Android app.");
    }
    lastError = null;
    try {
      const token = await ctx.host.googleToken(true);
      if (token === null) throw new Conflict("Google did not allow access.");
    } catch (error) {
      lastError = error instanceof DomainError ? error.detail : String(error);
      throw error instanceof DomainError
        ? error
        : new Conflict(`Google did not allow access (${lastError}).`);
    }
    await update(ctx, { connected: true, merged: {} });
    return { auth_url: null, status: await status(ctx) };
  },
  core_disconnect_cloud: async (_, ctx) => {
    await ctx.host.signOutGoogle().catch(() => undefined);
    await update(ctx, { connected: false, merged: {} });
    return status(ctx);
  },
  core_upload_cloud: (_, ctx) =>
    exclusive(async () => {
      requireConnected(await load(ctx));
      return upload(ctx, new Drive(ctx));
    }),
  core_download_cloud: (_, ctx) =>
    exclusive(async () => {
      requireConnected(await load(ctx));
      return download(ctx, new Drive(ctx));
    }),
  core_sync_cloud: (_, ctx) =>
    exclusive(async () => {
      requireConnected(await load(ctx));
      const drive = new Drive(ctx);
      const downloaded = await download(ctx, drive);
      return { download: downloaded, upload: await upload(ctx, drive) };
    }),
};
