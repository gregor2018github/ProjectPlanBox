import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeFetch, renderApp, useDesktopViewport } from "../test/renderApp";

afterEach(() => {
  vi.useRealTimers();
});

describe("app shell", () => {
  it("shows today in the server's timezone and the connection state", async () => {
    useDesktopViewport();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 22:30 UTC on Thursday is already Friday in Amsterdam.
    vi.setSystemTime(new Date("2026-10-08T22:30:00Z"));

    renderApp();

    expect(await screen.findByRole("heading", { name: "Friday, 9 October" })).toBeInTheDocument();
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("reports an unreachable server", async () => {
    useDesktopViewport();
    renderApp({ fetch: () => Promise.reject(new TypeError("Failed to fetch")) });

    expect(await screen.findByText("Offline")).toBeInTheDocument();
  });

  it("opens the palette with Ctrl+K and runs a command", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("Connected");

    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search commands" });
    await user.type(input, "shortcuts");
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Open command palette")).toBeInTheDocument();
    expect(within(dialog).getByText("Toggle sidebar")).toBeInTheDocument();
  });

  it("switches the theme from the palette and remembers it", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("Connected");

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox"), "night");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(window.localStorage.getItem("planbox.theme")).toBe("dark");
  });

  it("filters out commands that do not match", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox"), "zzzz");

    expect(await screen.findByText("Nothing matches.")).toBeInTheDocument();
  });

  it("collapses the desktop sidebar with [ and expands it again", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    renderApp();
    const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
    expect(sidebar).not.toHaveAttribute("inert");

    await user.keyboard("[[");
    expect(sidebar).toHaveAttribute("inert");
    expect(window.localStorage.getItem("planbox.sidebar.collapsed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(sidebar).not.toHaveAttribute("inert");
  });

  it("uses the theme switch in the sidebar", async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("opens navigation as a sheet on small screens", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Open navigation" }));

    const sheet = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(sheet).getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("shows a not-found page for unknown paths", async () => {
    renderApp({ path: "/nope", fetch: fakeFetch() });

    expect(await screen.findByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
  });
});
