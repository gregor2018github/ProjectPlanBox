/**
 * The device backend's HTTP surface: a `fetch`-shaped function that serves
 * the same API as the Python server, from the same OpenAPI document.
 *
 * Handlers are keyed by operation id and typed by the generated
 * `schema.d.ts`, so a handler cannot return a shape the frontend does not
 * expect. Core and every module contribute handlers (see `DeviceModule`).
 */
import type { operations } from "../api/schema";
import type { Clock } from "./clock";
import type { Database } from "./db";
import type { EntityRegistry } from "./entities";
import { DomainError, problemOf, type ProblemBody } from "./errors";
import type { MigrationSource } from "./migrations";
import { coerce, findRoute, validate, type Issue } from "./openapi";
import type { EntityType } from "./entities";

/** An API operation, e.g. `todos_create_item`. */
export type OperationId = keyof operations;

type Op<K extends OperationId> = operations[K];
type JsonContent<R> = R extends { content: { "application/json": infer B } } ? B : never;
type Success<K extends OperationId> = Extract<keyof Op<K>["responses"], 200 | 201 | 202>;

/** The success body of an operation. */
export type ResponseOf<K extends OperationId> = JsonContent<Op<K>["responses"][Success<K>]>;

/** The validated JSON body of an operation (undefined when it takes none). */
export type BodyOf<K extends OperationId> =
  Op<K> extends { requestBody: { content: { "application/json": infer B } } } ? B : undefined;

/** The validated query parameters of an operation. */
export type QueryOf<K extends OperationId> = NonNullable<Op<K>["parameters"]["query"]>;

/** The path parameters of an operation. */
export type PathOf<K extends OperationId> = NonNullable<Op<K>["parameters"]["path"]>;

/** What a handler receives. */
export interface HandlerRequest<K extends OperationId> {
  path: PathOf<K>;
  query: QueryOf<K>;
  body: BodyOf<K>;
  /** The body's top-level keys as sent (Pydantic's `model_fields_set`). */
  fields: ReadonlySet<string>;
}

/** A response with a status other than the operation's usual one (200 for an idempotent create). */
export class Answer<T> {
  constructor(
    readonly body: T,
    readonly status: number,
  ) {}
}

/** Serves one operation. */
export type Handler<K extends OperationId> = (
  request: HandlerRequest<K>,
  ctx: DeviceContext,
) => ResponseOf<K> | Answer<ResponseOf<K>> | Promise<ResponseOf<K> | Answer<ResponseOf<K>>>;

/** Handlers by operation id. */
export type Handlers = { [K in OperationId]?: Handler<K> };

/** Small files the device keeps beside its database (sync state, backups). */
export interface DeviceFiles {
  /** The names of the files in a folder. */
  list(folder: string): Promise<{ name: string; size: number }[]>;
  read(folder: string, name: string): Promise<Uint8Array | null>;
  write(folder: string, name: string, data: Uint8Array): Promise<void>;
  remove(folder: string, name: string): Promise<void>;
}

/** What only the app around the backend can do: Google sign-in. */
export interface DeviceHost {
  /** Whether Google sign-in exists here (the Android app; not a browser). */
  cloudAvailable: boolean;
  /**
   * An access token for Drive's app data folder. `interactive` may show
   * Google's consent screen; without it, null means "not connected".
   */
  googleToken(interactive: boolean): Promise<string | null>;
  /** Forgets the token after Google rejected it. */
  dropGoogleToken(token: string): Promise<void>;
  /** Withdraws access at Google. */
  signOutGoogle(): Promise<void>;
  /** Sends a request to Google (fetch, or the native HTTP of the app). */
  fetch(request: Request): Promise<Response>;
}

/** Everything a handler may use. */
export interface DeviceContext {
  db: Database;
  clock: Clock;
  /** The configured zone that defines "today". */
  zone: string;
  registry: EntityRegistry;
  /** The PlanBox version (equal to the Python package's). */
  version: string;
  /** How this device is named in Google Drive sync. */
  deviceName: string;
  files: DeviceFiles;
  host: DeviceHost;
}

/** A feature module's device side: its migrations, entity types and handlers. */
export interface DeviceModule {
  id: string;
  migrations: MigrationSource;
  entityTypes: readonly EntityType[];
  handlers: Handlers;
}

const PROBLEM_TYPE = "application/problem+json";

function json(body: unknown, status: number, type = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });
}

function problem(body: ProblemBody): Response {
  return json(body, body.status, PROBLEM_TYPE);
}

function invalid(issues: Issue[]): Response {
  return problem({
    type: "about:blank",
    title: "Invalid request",
    status: 422,
    detail: "The request did not match the expected shape.",
    code: "invalid_request",
    errors: issues,
  });
}

/** Answers API requests the way the Python server would. */
export class DeviceServer {
  constructor(
    private readonly ctx: DeviceContext,
    private readonly handlers: Handlers,
  ) {}

  /** The `fetch` the frontend's API client uses. */
  readonly fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const found = findRoute(request.method.toUpperCase(), url.pathname);
    if (!("route" in found)) {
      const status = found.methodMismatch ? 405 : 404;
      return problem({
        type: "about:blank",
        title: status === 404 ? "Not found" : "Method Not Allowed",
        status,
        detail: status === 404 ? `no API route ${url.pathname}` : "Method Not Allowed",
        code: status === 404 ? "not_found" : "http_405",
      });
    }
    const { route, values } = found;
    const issues: Issue[] = [];

    const path: Record<string, unknown> = {};
    for (const param of route.pathParams) {
      path[param.name] = validate(
        param.schema,
        coerce(values[param.name] ?? "", param.schema),
        ["path", param.name],
        issues,
      );
    }
    const query: Record<string, unknown> = {};
    for (const param of route.query) {
      const raw = url.searchParams.get(param.name);
      if (raw === null) {
        if (param.required === true) {
          issues.push({ loc: ["query", param.name], msg: "Field required", type: "missing" });
        } else if (param.schema.default !== undefined) {
          query[param.name] = param.schema.default;
        }
        continue;
      }
      query[param.name] = validate(
        param.schema,
        coerce(raw, param.schema),
        ["query", param.name],
        issues,
      );
    }
    let body: unknown = undefined;
    let fields = new Set<string>();
    if (route.body !== null) {
      const text = await request.text();
      if (text.trim() === "") {
        if (route.bodyRequired)
          issues.push({ loc: ["body"], msg: "Field required", type: "missing" });
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return invalid([{ loc: ["body"], msg: "JSON decode error", type: "json_invalid" }]);
        }
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          fields = new Set(Object.keys(parsed));
        }
        body = validate(route.body, parsed, ["body"], issues);
      }
    }
    if (issues.length > 0) return invalid(issues);

    const handler = this.handlers[route.operationId as OperationId] as
      Handler<OperationId> | undefined;
    if (handler === undefined) {
      return problem({
        type: "about:blank",
        title: "Not available",
        status: 501,
        detail: "This is not available in the phone app.",
        code: "not_on_device",
      });
    }
    try {
      const result = await handler(
        { path, query, body, fields } as unknown as HandlerRequest<OperationId>,
        this.ctx,
      );
      if (result instanceof Answer) return json(result.body, result.status);
      return json(result, route.status);
    } catch (error) {
      if (error instanceof DomainError) return problem(problemOf(error));
      console.error(`PlanBox device backend: ${route.operationId} failed`, error);
      return problem({
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : String(error),
        code: "internal_error",
      });
    }
  };
}
