import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";
import { TooltipProvider } from "./TooltipProvider";

describe("dialog", () => {
  it("closes from the top-right close button", async () => {
    const onOpenChange = vi.fn();
    render(
      <TooltipProvider>
        <Dialog open onOpenChange={onOpenChange} title="Rename">
          <p>Body</p>
        </Dialog>
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("can leave the close button out", () => {
    render(
      <TooltipProvider>
        <Dialog open onOpenChange={vi.fn()} title="Palette" closeButton={false}>
          <p>Body</p>
        </Dialog>
      </TooltipProvider>,
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
