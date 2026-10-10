import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { defaultRoutes, fakeFetch, renderApp, useDesktopViewport } from "../test/renderApp";

const launcherRoutes = {
  ...defaultRoutes,
  "/api/meta": { ...(defaultRoutes["/api/meta"] as object), can_shutdown: true },
  "/api/shutdown": { status: "stopping" },
};

describe("shutting down", () => {
  it("confirms, calls the server and shows the stopped screen", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    const calls: Request[] = [];
    renderApp({ fetch: fakeFetch(launcherRoutes, calls) });

    await user.click(await screen.findByRole("button", { name: "Shut down PlanBox" }));
    await screen.findByRole("dialog", { name: "Shut down PlanBox?" });
    await user.click(screen.getByRole("button", { name: "Shut down" }));

    expect(await screen.findByRole("heading", { name: "PlanBox has stopped" })).toBeInTheDocument();
    const shutdown = calls.find((r) => new URL(r.url).pathname === "/api/shutdown");
    expect(shutdown?.method).toBe("POST");
    expect(await shutdown?.json()).toEqual({ confirm: true });
  });

  it("can be cancelled", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    const calls: Request[] = [];
    renderApp({ fetch: fakeFetch(launcherRoutes, calls) });

    await user.click(await screen.findByRole("button", { name: "Shut down PlanBox" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(calls.some((r) => new URL(r.url).pathname === "/api/shutdown")).toBe(false);
  });

  it("is offered in the command palette", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    renderApp({ fetch: fakeFetch(launcherRoutes) });
    await screen.findByRole("button", { name: "Shut down PlanBox" });

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox"), "quit");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "Shut down PlanBox?" })).toBeInTheDocument();
  });

  it("is hidden when the server was not started by the launcher", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("Connected");

    expect(screen.queryByRole("button", { name: "Shut down PlanBox" })).not.toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox"), "shut down");
    expect(await screen.findByText("Nothing matches.")).toBeInTheDocument();
  });
});
