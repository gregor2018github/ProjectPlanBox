import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../ui/Button";
import { Menu } from "../ui/Menu";
import { Sheet } from "../ui/Sheet";
import { handleBack, useBackHandler } from "./back";

function SheetHarness() {
  const [open, setOpen] = useState(true);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Navigation">
      <button type="button">Inside</button>
    </Sheet>
  );
}

describe("the back gesture", () => {
  it("is not handled when nothing is open, so the app goes back a page", () => {
    expect(handleBack()).toBe(false);
  });

  it("closes an open sheet", async () => {
    render(<SheetHarness />);
    await screen.findByRole("dialog", { name: "Navigation" });

    act(() => {
      expect(handleBack()).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes an open menu", async () => {
    const user = userEvent.setup();
    render(
      <Menu
        trigger={<Button>More</Button>}
        entries={[{ id: "rename", label: "Rename", onSelect: () => undefined }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await screen.findByRole("menu");

    act(() => {
      expect(handleBack()).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("calls the latest registered handler while it is active", () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => {
      useBackHandler(first);
    });
    const { rerender, unmount } = renderHook(
      ({ onBack }) => {
        useBackHandler(onBack);
      },
      { initialProps: { onBack: second as (() => void) | null } },
    );

    expect(handleBack()).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();

    rerender({ onBack: null });
    expect(handleBack()).toBe(true);
    expect(first).toHaveBeenCalledOnce();

    unmount();
  });
});
