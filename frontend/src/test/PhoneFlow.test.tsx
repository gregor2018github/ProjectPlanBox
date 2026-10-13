import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { FetchFn } from "../core/api/client";
import type { PhoneAccess, Preferences, Session } from "../core/api/types";
import { defaultRoutes, renderApp, useDesktopViewport } from "./renderApp";

const backups = { backups: [], offsite: null, scheduled: true };

/** A fake API whose answers can change between calls, recording every request. */
function stateful(routes: Record<string, unknown | ((request: Request) => unknown)>) {
  const calls: Request[] = [];
  const fetch: FetchFn = async (request) => {
    calls.push(request.clone());
    const path = new URL(request.url).pathname;
    const route = routes[path];
    if (route === undefined) {
      return new Response(JSON.stringify({ title: "Not found", status: 404, code: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/problem+json" },
      });
    }
    const body: unknown = typeof route === "function" ? await route(request) : route;
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls };
}

const problem = (status: number, detail: string) =>
  new Response(JSON.stringify({ title: "x", status, detail, code: "unauthorized" }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

describe("phone access", () => {
  beforeEach(() => {
    useDesktopViewport();
    window.localStorage.clear();
  });

  it("asks an unpaired phone for the code, then shows the app", async () => {
    const user = userEvent.setup();
    let session: Session = { signed_in: false, local: false, phone_access: true };
    const api = stateful({
      ...defaultRoutes,
      "/api/auth/session": () => session,
      "/api/auth/sign-in": async (request: Request) => {
        const { code } = (await request.json()) as { code: string };
        if (code !== "ABCD-EFGH") return problem(401, "That code is not right.");
        session = { signed_in: true, local: false, phone_access: true };
        return session;
      },
    });
    renderApp({ fetch: api.fetch });

    const field = await screen.findByRole("textbox", { name: "Pairing code" });
    await user.type(field, "WRONG{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right.");

    await user.clear(field);
    await user.type(field, "ABCD-EFGH{Enter}");
    expect(await screen.findByRole("link", { name: "Data" })).toBeInTheDocument();
  });

  it("goes back to the sign-in screen when the session is revoked", async () => {
    let session: Session = { signed_in: true, local: false, phone_access: true };
    const api = stateful({
      ...defaultRoutes,
      "/api/auth/session": () => session,
      "/api/data/backups": () => {
        session = { signed_in: false, local: false, phone_access: true };
        return problem(401, "Pair this device.");
      },
    });
    renderApp({ path: "/data", fetch: api.fetch });

    expect(await screen.findByRole("textbox", { name: "Pairing code" })).toBeInTheDocument();
  });

  it("explains how to turn phone access on", async () => {
    const off: PhoneAccess = { enabled: false, urls: [], tls: false, pairing: null };
    const api = stateful({
      ...defaultRoutes,
      "/api/data/backups": backups,
      "/api/auth/phones": off,
    });
    renderApp({ path: "/data", fetch: api.fetch });

    expect(await screen.findByText(/Off\. To turn it on/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pair a phone" })).not.toBeInTheDocument();
  });

  it("shows the address and a pairing code on the PC", async () => {
    const user = userEvent.setup();
    let access: PhoneAccess = {
      enabled: true,
      urls: ["http://192.168.2.12:8765"],
      tls: false,
      pairing: null,
    };
    const api = stateful({
      ...defaultRoutes,
      "/api/data/backups": backups,
      "/api/auth/phones": () => access,
      "/api/auth/pairing": () => {
        const pairing = { code: "ABCD-EFGH", expires_at: "2026-10-08T12:10:00.000Z" };
        access = { ...access, pairing };
        return pairing;
      },
    });
    renderApp({ path: "/data", fetch: api.fetch });

    expect(await screen.findByText("http://192.168.2.12:8765")).toBeInTheDocument();
    expect(screen.getByText(/Plain http/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pair a phone" }));

    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByText("Works once, until Thu 8 Oct, 14:10.")).toBeInTheDocument();
  });

  it("lets a phone sign itself out, and never asks it to pair others", async () => {
    const user = userEvent.setup();
    const api = stateful({
      ...defaultRoutes,
      "/api/auth/session": { signed_in: true, local: false, phone_access: true },
      "/api/data/backups": backups,
      "/api/auth/sign-out": { signed_in: false, local: false, phone_access: true },
    });
    renderApp({ path: "/data", fetch: api.fetch });

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("textbox", { name: "Pairing code" })).toBeInTheDocument();
    expect(api.calls.some((r) => r.url.endsWith("/api/auth/phones"))).toBe(false);
  });
});

describe("the shared theme", () => {
  beforeEach(() => {
    useDesktopViewport();
    window.localStorage.clear();
  });

  it("takes the server's theme", async () => {
    const api = stateful({ ...defaultRoutes, "/api/preferences": { theme: "dark" } });
    renderApp({ fetch: api.fetch });

    await waitFor(() => {
      expect(window.localStorage.getItem("planbox.theme")).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("hands this device's choice to a server that has none yet", async () => {
    window.localStorage.setItem("planbox.theme", "light");
    let prefs: Preferences = { theme: null };
    const api = stateful({
      ...defaultRoutes,
      "/api/preferences": async (request: Request) => {
        if (request.method === "PATCH") prefs = (await request.json()) as Preferences;
        return prefs;
      },
    });
    renderApp({ fetch: api.fetch });

    await waitFor(() => {
      expect(prefs.theme).toBe("light");
    });
  });

  it("sends a change made here", async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    const api = stateful({
      ...defaultRoutes,
      "/api/preferences": async (request: Request) => {
        if (request.method !== "PATCH") return { theme: "system" };
        const body: unknown = await request.json();
        patches.push(body);
        return body;
      },
    });
    renderApp({ fetch: api.fetch });
    await waitFor(() => {
      expect(api.calls.some((r) => r.url.endsWith("/api/preferences"))).toBe(true);
    });

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox"), "theme dark");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(patches).toEqual([{ theme: "dark" }]);
    });
  });
});
