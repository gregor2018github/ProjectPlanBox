import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MiniMonthDay } from "./MiniMonthDay";

vi.mock("../useDayDrop", () => ({
  useDayDrop: () => ({ ref: () => undefined, isDropTarget: false }),
}));

function renderDay(events: number, entries: number, isSelected = false) {
  render(
    <MiniMonthDay
      date="2026-11-06"
      inMonth
      isToday={false}
      isSelected={isSelected}
      events={events}
      entries={entries}
      surface="test"
      onSelect={() => undefined}
    />,
  );
  const button = screen.getByRole("button");
  return {
    button,
    event: button.querySelector('[data-dot="event"]'),
    entry: button.querySelector('[data-dot="entry"]'),
  };
}

describe("MiniMonthDay", () => {
  it("shows a purple dot for events and an accent dot for todos", () => {
    const { button, event, entry } = renderDay(2, 1);
    expect(event).toHaveClass("bg-event");
    expect(entry).toHaveClass("bg-accent");
    expect(button).toHaveAccessibleName(/3 items$/);
  });

  it("shows only the kinds the day has", () => {
    const eventsOnly = renderDay(1, 0);
    expect(eventsOnly.event).not.toBeNull();
    expect(eventsOnly.entry).toBeNull();
  });

  it("shows no dots on an empty day", () => {
    const { event, entry } = renderDay(0, 0);
    expect(event).toBeNull();
    expect(entry).toBeNull();
  });

  it("uses the on-accent colour for both dots on the selected day", () => {
    const { event, entry } = renderDay(1, 1, true);
    expect(event).toHaveClass("bg-on-accent");
    expect(entry).toHaveClass("bg-on-accent");
  });
});
