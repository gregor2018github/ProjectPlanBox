import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { installMatchMedia } from "../test/matchMedia";
import { SPLASH_SEEN_KEY, StartupSplash } from "./StartupSplash";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("startup splash", () => {
  it("shows the logo once per tab", () => {
    const { unmount } = render(<StartupSplash />);
    expect(screen.getByTestId("startup-splash")).toHaveTextContent("PlanBox");
    expect(window.sessionStorage.getItem(SPLASH_SEEN_KEY)).toBe("1");
    unmount();

    render(<StartupSplash />);
    expect(screen.queryByTestId("startup-splash")).not.toBeInTheDocument();
  });

  it("is skipped by any key", async () => {
    render(<StartupSplash />);
    const splash = screen.getByTestId("startup-splash");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    // Clicks go straight through to the app while it fades.
    expect(splash).toHaveClass("pointer-events-none");
    await waitFor(() => {
      expect(screen.queryByTestId("startup-splash")).not.toBeInTheDocument();
    });
  });

  it("does not play with reduced motion", () => {
    installMatchMedia((query) => query.includes("prefers-reduced-motion"));
    render(<StartupSplash />);
    expect(screen.queryByTestId("startup-splash")).not.toBeInTheDocument();
  });
});
