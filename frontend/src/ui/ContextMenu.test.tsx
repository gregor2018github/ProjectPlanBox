import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenu } from "./ContextMenu";

const entries = [{ id: "rename", label: "Rename", onSelect: () => undefined }];

/** Holds a finger on `target` past Base UI's long-press delay. */
function longPress(target: Element) {
  fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.touchEnd(target, { touches: [] });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ContextMenu", () => {
  it("opens on a long-press by default", () => {
    vi.useFakeTimers();
    render(
      <ContextMenu entries={entries}>
        <div>Row</div>
      </ContextMenu>,
    );
    longPress(screen.getByText("Row"));
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });

  it("leaves a long-press to dragging when longPress is off, but still opens on right-click", () => {
    vi.useFakeTimers();
    render(
      <ContextMenu entries={entries} longPress={false}>
        <div>Row</div>
      </ContextMenu>,
    );
    const row = screen.getByText("Row");
    longPress(row);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

    fireEvent.contextMenu(row);
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });
});
