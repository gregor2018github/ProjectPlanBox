import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CloudStatus } from "../core/api/types";
import type { components } from "../core/api/schema";
import { defaultRoutes, fakeFetch, renderApp, useDesktopViewport } from "./renderApp";

const status: CloudStatus = {
  available: true,
  connected: true,
  connecting: false,
  device_id: "01990000-0000-7000-8000-000000000001",
  device_name: "Home PC",
  last_upload_at: "2026-10-08T12:00:00.000Z",
  last_download_at: null,
  error: null,
};

const devices: components["schemas"]["CloudDeviceOut"][] = [
  {
    device_id: status.device_id,
    name: "Home PC",
    uploaded_at: "2026-10-08T12:00:00.000Z",
    exported_at: "2026-10-08T12:00:00.000Z",
    app_version: "0.2.2",
    size: 2048,
    this_device: true,
  },
  {
    device_id: "01990000-0000-7000-8000-000000000002",
    name: "Android phone",
    uploaded_at: "2026-10-08T13:30:00.000Z",
    exported_at: "2026-10-08T13:30:00.000Z",
    app_version: "0.2.2",
    size: 1024,
    this_device: false,
  },
];

const sync: components["schemas"]["CloudSyncOut"] = {
  download: {
    devices: [
      {
        device: devices[1] as components["schemas"]["CloudDeviceOut"],
        status: "merged",
        error: null,
        result: {
          backup: "planbox-20261008T140000000Z-pre-import.db",
          tables: [{ table: "todos", inserted: 3, updated: 1, unchanged: 5, conflicts: 0 }],
        },
      },
    ],
  },
  upload: { uploaded_at: "2026-10-08T14:00:00.000Z", size: 2100 },
};

describe("Google Drive sync on the Data page", () => {
  beforeEach(() => {
    useDesktopViewport();
  });

  it("explains how to set it up on a PC without an OAuth client", async () => {
    const routes = {
      ...defaultRoutes,
      "/api/cloud": { ...status, available: false, connected: false },
    };
    renderApp({ path: "/data", fetch: fakeFetch(routes) });
    expect(await screen.findByText(/google_client_id/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
  });

  it("opens Google's sign-in page in a new tab to connect", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const started = { ...status, connected: false, connecting: true };
    const routes = {
      ...defaultRoutes,
      "/api/cloud": { ...status, connected: false },
      "/api/cloud/connect": {
        auth_url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
        status: started,
      },
    };
    const inner = fakeFetch(routes);
    // Once a sign-in started, the server reports it as connecting.
    const fetch = (request: Request) => {
      if (new URL(request.url).pathname === "/api/cloud/connect") routes["/api/cloud"] = started;
      return inner(request);
    };
    renderApp({ path: "/data", fetch });
    await userEvent.click(await screen.findByRole("button", { name: "Connect Google Drive" }));
    await vi.waitFor(() => {
      expect(tab.location.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    });
    expect(await screen.findByText(/Finish signing in to Google/)).toBeInTheDocument();
  });

  it("lists the devices and syncs, reporting what was merged", async () => {
    const calls: Request[] = [];
    const routes = {
      ...defaultRoutes,
      "/api/cloud": status,
      "/api/cloud/devices": devices,
      "/api/cloud/sync": sync,
    };
    renderApp({ path: "/data", fetch: fakeFetch(routes, calls) });

    const list = await screen.findByRole("list", { name: "Devices in Google Drive" });
    expect(within(list).getByText("(this device)")).toBeInTheDocument();
    expect(within(list).getByText("Android phone")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(await screen.findByText(/Android phone: 3 new, 1 updated\./)).toBeInTheDocument();
    const posted = calls.find((c) => new URL(c.url).pathname === "/api/cloud/sync");
    expect(posted?.method).toBe("POST");
  });
});
