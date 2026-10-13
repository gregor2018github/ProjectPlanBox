import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Backups, ExportFile, ImportReport } from "../core/api/types";
import { defaultRoutes, fakeFetch, renderApp, useDesktopViewport } from "./renderApp";

const backups: Backups = {
  backups: [
    {
      name: "planbox-20261008T120000000Z-daily.db",
      label: "daily",
      taken_at: "2026-10-08T12:00:00.000Z",
      size: 49152,
    },
  ],
  offsite: null,
  scheduled: true,
};

const exportFile: ExportFile = {
  format: "planbox-export",
  format_version: 1,
  app_version: "0.2.0",
  exported_at: "2026-10-08T12:05:00.000Z",
  migrations: [],
  tables: { todos: { columns: ["id"], rows: [] } },
};

const report: ImportReport = {
  backup: "planbox-20261008T120600000Z-pre-import.db",
  tables: [{ table: "todos", inserted: 2, updated: 1, unchanged: 0, conflicts: 0 }],
};

const routes = {
  ...defaultRoutes,
  "/api/data/backups": backups,
  "/api/data/export": exportFile,
  "/api/data/import": report,
};

describe("the Data page", () => {
  beforeEach(() => {
    useDesktopViewport();
    URL.createObjectURL = vi.fn(() => "blob:export");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists backups and explains how to add an off-site copy", async () => {
    renderApp({ path: "/data", fetch: fakeFetch(routes) });

    const list = await screen.findByRole("list", { name: "Backups on this PC" });
    expect(within(list).getByText("Thu 8 Oct, 14:00")).toBeInTheDocument();
    expect(within(list).getByText("Daily")).toBeInTheDocument();
    expect(within(list).getByText("48 KB")).toBeInTheDocument();
    expect(screen.getByText(/Not set up/)).toBeInTheDocument();
  });

  it("shows a failing off-site folder", async () => {
    const failing = {
      ...routes,
      "/api/data/backups": {
        ...backups,
        offsite: {
          path: "E:/PlanBox",
          reachable: false,
          latest_at: null,
          error: "E: is not reachable",
        },
      },
    };
    renderApp({ path: "/data", fetch: fakeFetch(failing) });

    expect(await screen.findByText("E:/PlanBox")).toBeInTheDocument();
    expect(screen.getByText(/The last copy failed: E: is not reachable/)).toBeInTheDocument();
  });

  it("takes a backup on request", async () => {
    const user = userEvent.setup();
    const calls: Request[] = [];
    renderApp({
      path: "/data",
      fetch: fakeFetch({ ...routes, "/api/data/backups": backups }, calls),
    });

    await user.click(await screen.findByRole("button", { name: "Back up now" }));

    const post = calls.find((r) => r.method === "POST" && r.url.endsWith("/api/data/backups"));
    expect(await post?.json()).toEqual({ confirm: true });
    expect(await screen.findByText("Backup saved")).toBeInTheDocument();
  });

  it("downloads an export", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderApp({ path: "/data", fetch: fakeFetch(routes) });

    await user.click(await screen.findByRole("button", { name: "Download export" }));

    await vi.waitFor(() => {
      expect(click).toHaveBeenCalled();
    });
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("planbox-export-20261008T120500000Z.json");
  });

  it("imports a picked export after confirmation", async () => {
    const user = userEvent.setup();
    const calls: Request[] = [];
    renderApp({ path: "/data", fetch: fakeFetch(routes, calls) });

    const input = await screen.findByLabelText("Export file to import");
    const file = new File([JSON.stringify(exportFile)], "home.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog", { name: "Import home.json?" });
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    expect(await screen.findByText("2 new, 1 updated.")).toBeInTheDocument();
    const post = calls.find((r) => r.url.endsWith("/api/data/import"));
    expect(await post?.json()).toEqual(exportFile);
  });

  it("refuses a file that is not an export", async () => {
    const calls: Request[] = [];
    renderApp({ path: "/data", fetch: fakeFetch(routes, calls) });

    const input = await screen.findByLabelText("Export file to import");
    fireEvent.change(input, { target: { files: [new File(["hello"], "notes.txt")] } });

    // Error toasts also speak through the assertive live region, so the title shows twice.
    expect(await screen.findAllByText("Not a PlanBox export")).not.toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((r) => r.url.endsWith("/api/data/import"))).toBe(false);
  });

  it("is reachable from the sidebar", async () => {
    const user = userEvent.setup();
    renderApp({ fetch: fakeFetch(routes) });

    await user.click(await screen.findByRole("link", { name: "Data" }));

    expect(await screen.findByRole("heading", { name: "Data", level: 1 })).toBeInTheDocument();
  });
});
