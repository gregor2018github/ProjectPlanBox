/**
 * Routing and request validation from the backend's own OpenAPI document.
 *
 * `openapi.json` (written by `scripts/gen_api.py`) already says which routes
 * exist, what their parameters and bodies look like, and their success
 * status. The device backend reads it instead of restating it, so a route
 * or a field added on the server reaches the phone's validation by
 * regenerating the types. Validation follows Pydantic where the frontend
 * can notice: defaults are filled in, unknown fields are dropped, and
 * failures are 422 `invalid_request` problems.
 */
import spec from "../api/openapi.json";
import { textLength } from "./errors";
import { parseDate, parseInstant } from "./time";

/** The subset of JSON Schema Pydantic emits. */
export interface Schema {
  $ref?: string;
  type?: string;
  anyOf?: Schema[];
  const?: unknown;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: Schema | boolean;
}

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema: Schema;
}

interface Operation {
  operationId: string;
  parameters?: Parameter[];
  requestBody?: { required?: boolean; content: Record<string, { schema: Schema }> };
  responses: Record<string, unknown>;
}

/** One route: how to recognise it and what it expects. */
export interface Route {
  method: string;
  template: string;
  operationId: string;
  pattern: RegExp;
  params: string[];
  query: Parameter[];
  pathParams: Parameter[];
  body: Schema | null;
  bodyRequired: boolean;
  status: number;
}

/** One validation failure, as Pydantic reports it. */
export interface Issue {
  loc: (string | number)[];
  msg: string;
  type: string;
}

const document = spec as unknown as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

function resolve(schema: Schema): Schema {
  if (schema.$ref === undefined) return schema;
  const name = schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1);
  const found = document.components.schemas[name];
  if (found === undefined) throw new Error(`unknown schema ${schema.$ref}`);
  return found;
}

/** Every route of the API, literal segments before parameters (as FastAPI matches them). */
export const ROUTES: readonly Route[] = Object.entries(document.paths)
  .flatMap(([template, methods]) =>
    Object.entries(methods).map(([method, op]) => {
      const params: string[] = [];
      const source = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
        params.push(name);
        return "([^/]+)";
      });
      const parameters = op.parameters ?? [];
      const success = Object.keys(op.responses).find((code) => code.startsWith("2")) ?? "200";
      const body = op.requestBody?.content["application/json"]?.schema ?? null;
      return {
        method: method.toUpperCase(),
        template,
        operationId: op.operationId,
        pattern: new RegExp(`^${source}$`),
        params,
        query: parameters.filter((p) => p.in === "query"),
        pathParams: parameters.filter((p) => p.in === "path"),
        body,
        bodyRequired: op.requestBody?.required === true,
        status: Number(success),
      };
    }),
  )
  .sort((a, b) => literalSegments(b.template) - literalSegments(a.template));

function literalSegments(template: string): number {
  return template.split("/").filter((s) => s && !s.startsWith("{")).length;
}

/** Finds the route for a request; `methodMismatch` when only the method is wrong. */
export function findRoute(
  method: string,
  path: string,
): { route: Route; values: Record<string, string> } | { methodMismatch: boolean } {
  let pathMatched = false;
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match === null) continue;
    pathMatched = true;
    if (route.method !== method) continue;
    const values: Record<string, string> = {};
    route.params.forEach((name, i) => {
      values[name] = decodeURIComponent(match[i + 1] ?? "");
    });
    return { route, values };
  }
  return { methodMismatch: pathMatched };
}

// ---------------------------------------------------------------- validation

/** Validates `value` against `schema`; returns the value with defaults filled in. */
export function validate(
  schema: Schema,
  value: unknown,
  loc: (string | number)[],
  issues: Issue[],
): unknown {
  const s = resolve(schema);
  if (s.anyOf !== undefined) {
    for (const option of s.anyOf) {
      const trial: Issue[] = [];
      const result = validate(option, value, loc, trial);
      if (trial.length === 0) return result;
    }
    issues.push({ loc, msg: "Input does not match any allowed type", type: "union" });
    return value;
  }
  if (s.const !== undefined && value !== s.const) {
    issues.push({ loc, msg: `Input should be ${JSON.stringify(s.const)}`, type: "literal_error" });
    return value;
  }
  if (s.enum !== undefined && !s.enum.includes(value)) {
    issues.push({ loc, msg: `Input should be one of ${JSON.stringify(s.enum)}`, type: "enum" });
    return value;
  }
  switch (s.type) {
    case undefined:
      return value;
    case "null":
      if (value !== null) issues.push({ loc, msg: "Input should be None", type: "none_required" });
      return value;
    case "boolean":
      if (typeof value !== "boolean") {
        issues.push({ loc, msg: "Input should be a valid boolean", type: "bool_type" });
      }
      return value;
    case "integer":
    case "number": {
      const ok =
        typeof value === "number" &&
        Number.isFinite(value) &&
        (s.type === "number" || Number.isInteger(value));
      if (!ok) {
        issues.push({
          loc,
          msg: `Input should be a valid ${s.type}`,
          type: `${s.type === "integer" ? "int" : "float"}_type`,
        });
        return value;
      }
      if (s.minimum !== undefined && value < s.minimum) {
        issues.push({
          loc,
          msg: `Input should be greater than or equal to ${String(s.minimum)}`,
          type: "greater_than_equal",
        });
      }
      if (s.maximum !== undefined && value > s.maximum) {
        issues.push({
          loc,
          msg: `Input should be less than or equal to ${String(s.maximum)}`,
          type: "less_than_equal",
        });
      }
      return value;
    }
    case "string": {
      if (typeof value !== "string") {
        issues.push({ loc, msg: "Input should be a valid string", type: "string_type" });
        return value;
      }
      const length = textLength(value);
      if (s.minLength !== undefined && length < s.minLength) {
        issues.push({
          loc,
          msg: `String should have at least ${String(s.minLength)} characters`,
          type: "string_too_short",
        });
      }
      if (s.maxLength !== undefined && length > s.maxLength) {
        issues.push({
          loc,
          msg: `String should have at most ${String(s.maxLength)} characters`,
          type: "string_too_long",
        });
      }
      if (s.format === "date" && parseDate(value) === null) {
        issues.push({ loc, msg: "Input should be a valid date", type: "date_parsing" });
      }
      if (s.format === "date-time" && parseInstant(value) === null) {
        issues.push({ loc, msg: "Input should be a valid datetime", type: "datetime_parsing" });
      }
      return value;
    }
    case "array": {
      if (!Array.isArray(value)) {
        issues.push({ loc, msg: "Input should be a valid list", type: "list_type" });
        return value;
      }
      if (s.maxItems !== undefined && value.length > s.maxItems) {
        issues.push({
          loc,
          msg: `List should have at most ${String(s.maxItems)} items`,
          type: "too_long",
        });
      }
      const items = s.items;
      return items === undefined
        ? value
        : value.map((item, i) => validate(items, item, [...loc, i], issues));
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        issues.push({
          loc,
          msg: "Input should be a valid dictionary or object",
          type: "model_type",
        });
        return value;
      }
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const properties = s.properties ?? {};
      for (const [name, property] of Object.entries(properties)) {
        if (name in input) {
          out[name] = validate(property, input[name], [...loc, name], issues);
        } else if (s.required?.includes(name) === true) {
          issues.push({ loc: [...loc, name], msg: "Field required", type: "missing" });
        } else {
          const fallback = resolve(property).default ?? property.default;
          if (fallback !== undefined) out[name] = structuredClone(fallback);
        }
      }
      const extra = s.additionalProperties;
      if (typeof extra === "object") {
        for (const [name, item] of Object.entries(input)) {
          if (!(name in properties)) out[name] = validate(extra, item, [...loc, name], issues);
        }
      }
      return out;
    }
    default:
      return value;
  }
}

/** Validates a value against a named component schema (e.g. `ExportFile`). */
export function validateNamed(name: string, value: unknown): { value: unknown; issues: Issue[] } {
  const issues: Issue[] = [];
  const result = validate({ $ref: `#/components/schemas/${name}` }, value, [], issues);
  return { value: result, issues };
}

/** Turns a query or path string into the type its schema asks for. */
export function coerce(raw: string, schema: Schema): unknown {
  const s = resolve(schema);
  const type = s.type ?? s.anyOf?.map(resolve).find((o) => o.type !== "null")?.type;
  if (type === "integer" && /^[+-]?\d+$/.test(raw)) return Number(raw);
  if (type === "number" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  if (type === "boolean") {
    const lower = raw.toLowerCase();
    if (["true", "1", "yes", "on"].includes(lower)) return true;
    if (["false", "0", "no", "off"].includes(lower)) return false;
  }
  return raw;
}
