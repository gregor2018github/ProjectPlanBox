import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Kbd } from "../../ui/Kbd";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { useShortcut } from "./useShortcut";

vi.mock("../platform", () => ({ IS_DEVICE: true }));

function Probe({ run }: { run: () => void }) {
  useShortcut({ id: "probe", keys: "Q", description: "Probe", group: "Test", run });
  return <Kbd keys="Q" />;
}

describe("the phone app", () => {
  it("ignores key presses and shows no key caps", () => {
    const run = vi.fn();
    const { container } = render(
      <ShortcutsProvider>
        <Probe run={run} />
      </ShortcutsProvider>,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));

    expect(run).not.toHaveBeenCalled();
    expect(container.querySelector("kbd")).toBeNull();
    expect(screen.queryByText("Q")).toBeNull();
  });
});
