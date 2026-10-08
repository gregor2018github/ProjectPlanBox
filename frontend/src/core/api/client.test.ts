import { describe, expect, it } from "vitest";

import { ApiError, createApiClient, unwrap, type FetchFn } from "./client";

function respond(status: number, body: unknown, contentType = "application/json"): FetchFn {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } }),
    );
}

describe("unwrap", () => {
  it("returns data on success", async () => {
    const client = createApiClient(
      respond(200, { status: "ok", version: "0.1.0", schema_versions: {} }),
    );
    const health = await unwrap(client.GET("/api/health"));
    expect(health.status).toBe("ok");
  });

  it("throws an ApiError carrying the problem", async () => {
    const problem = {
      type: "about:blank",
      title: "Not found",
      status: 404,
      detail: "gone",
      code: "not_found",
    };
    const client = createApiClient(respond(404, problem, "application/problem+json"));
    const error = await unwrap(client.GET("/api/health")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe("not_found");
    expect((error as ApiError).message).toBe("gone");
  });

  it("reports an unreachable server with status 0", async () => {
    const client = createApiClient(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await unwrap(client.GET("/api/health")).catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toBe("Server unreachable");
  });
});
