import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarGrid } from "./CalendarGrid";

describe("CalendarGrid", () => {
  it("marks today, even on a weekend and while another day is selected", () => {
    render(<CalendarGrid selected="2026-10-14" today="2026-10-10" onSelect={() => undefined} />);
    const today = screen.getByRole("gridcell", { current: "date" });
    expect(today).toHaveTextContent("10");
    expect(today).toHaveClass("text-accent", "ring-accent");
    expect(today).not.toHaveClass("text-text-muted");
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent("14");
  });
});
