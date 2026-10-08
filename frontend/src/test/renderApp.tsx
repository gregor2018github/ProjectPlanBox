import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";

import { App } from "../app/App";
import { createApiClient, type FetchFn } from "../core/api/client";
import type { Health, Meta } from "../core/api/types";
import { installMatchMedia } from "./matchMedia";

/** Canned API responses keyed by path; a function may fail on purpose. */
export type Routes = Record<string, unknown>;

export const defaultRoutes: Routes = {
  "/api/health": { status: "ok", version: "0.1.0", schema_versions: {} } satisfies Health,
  "/api/meta": {
    version: "0.1.0",
    mode: "test",
    timezone: "Europe/Amsterdam",
    week_starts_on: 1,
    can_shutdown: false,
  } satisfies Meta,
};

/** A fetch that answers from `routes` and 404s everything else. */
export function fakeFetch(routes: Routes = defaultRoutes, calls: Request[] = []): FetchFn {
  return (request) => {
    calls.push(request);
    const path = new URL(request.url).pathname;
    if (!(path in routes)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ title: "Not found", status: 404, detail: path, code: "not_found" }),
          { status: 404, headers: { "content-type": "application/problem+json" } },
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(routes[path]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

/** Makes `(min-width: …)` media queries match, i.e. a desktop-sized window. */
export function useDesktopViewport(): void {
  installMatchMedia((query) => query.includes("min-width"));
}

/** Renders the whole app at `path` against a fake API. */
export function renderApp(options: { path?: string; fetch?: FetchFn } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const history = createMemoryHistory({ initialEntries: [options.path ?? "/"] });
  return render(
    <App
      apiClient={createApiClient(options.fetch ?? fakeFetch())}
      queryClient={queryClient}
      history={history}
      modules={[]}
    />,
  );
}
