import createClient, { type Client } from "openapi-fetch";

import type { paths } from "./schema";
import type { Problem } from "./types";

/** The typed HTTP client for the PlanBox API. */
export type ApiClient = Client<paths>;

/** A fetch implementation, injectable for tests. */
export type FetchFn = (request: Request) => Promise<Response>;

/** Creates an API client for the current origin (Vite proxies /api in dev). */
export function createApiClient(fetchFn?: FetchFn): ApiClient {
  return createClient<paths>({
    baseUrl: window.location.origin,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
}

/** A failed API call. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | null;

  constructor(status: number, problem: Problem | null, message?: string) {
    super(message ?? problem?.detail ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  /** The problem's stable machine-readable code, if the server sent one. */
  get code(): string | null {
    return this.problem?.code ?? null;
  }
}

/** The shape of every openapi-fetch result: data or error, plus the raw response. */
interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

/**
 * Awaits an openapi-fetch call and returns its data, or throws an ApiError
 * carrying the server's problem document.
 */
export async function unwrap<R extends ApiResult>(
  call: Promise<R>,
): Promise<NonNullable<R["data"]>> {
  let result: R;
  try {
    result = await call;
  } catch (cause) {
    throw new ApiError(0, null, cause instanceof Error ? "Server unreachable" : String(cause));
  }
  if (result.error !== undefined) {
    throw new ApiError(result.response.status, isProblem(result.error) ? result.error : null);
  }
  return result.data as NonNullable<R["data"]>;
}

function isProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "status" in value &&
    "detail" in value
  );
}
