import { describe, expect, it } from "vitest";

import { hasEnded, isDone, toggledMark } from "./done";
import type { Occurrence } from "./types";

const NOW = "2026-10-08T10:00:00.000Z";
const TODAY = "2026-10-08";

function timed(end_at: string, marked_done: boolean | null = null): Occurrence {
  return {
    event_id: "e1",
    occurrence_date: "2026-10-08",
    start_at: "2026-10-08T07:00:00.000Z",
    end_at,
    start_date: null,
    end_date: null,
    marked_done,
  };
}

function allDay(end_date: string): Occurrence {
  return { ...timed(""), start_at: null, end_at: null, start_date: "2026-10-06", end_date };
}

describe("event done state", () => {
  it("is done once over: a timed event at its end, an all-day one after its last day", () => {
    expect(hasEnded(timed("2026-10-08T10:00:00.000Z"), NOW, TODAY)).toBe(true);
    expect(hasEnded(timed("2026-10-08T10:01:00.000Z"), NOW, TODAY)).toBe(false);
    expect(hasEnded(allDay("2026-10-07"), NOW, TODAY)).toBe(true);
    expect(hasEnded(allDay("2026-10-08"), NOW, TODAY)).toBe(false);
  });

  it("follows a mark set by hand either way", () => {
    expect(isDone(timed("2026-10-08T09:00:00.000Z", false), NOW, TODAY)).toBe(false);
    expect(isDone(timed("2026-10-08T12:00:00.000Z", true), NOW, TODAY)).toBe(true);
  });

  it("toggles with a mark only where it differs from the automatic state", () => {
    const upcoming = timed("2026-10-08T12:00:00.000Z");
    expect(toggledMark(upcoming, NOW, TODAY)).toBe(true);
    expect(toggledMark({ ...upcoming, marked_done: true }, NOW, TODAY)).toBeNull();
    const over = timed("2026-10-08T09:00:00.000Z");
    expect(toggledMark(over, NOW, TODAY)).toBe(false);
    expect(toggledMark({ ...over, marked_done: false }, NOW, TODAY)).toBeNull();
  });
});
