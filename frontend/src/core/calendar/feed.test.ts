import { describe, expect, it, vi } from "vitest";

import type { DropInfo } from "../../ui/dnd";
import { dateDropData, droppedDate } from "./dateDrop";
import { CalendarFeedRegistry, type CalendarFeed } from "./feed";

const feed = (id: string): CalendarFeed => ({
  id,
  label: id,
  entries: [],
  reschedule: vi.fn(),
  toggleDone: vi.fn(),
});

const drop = (data: Record<string, unknown> | null, canceled = false): DropInfo => ({
  canceled,
  target: data === null ? null : { id: "x", data },
  group: null,
  index: null,
  initialGroup: null,
  initialIndex: null,
});

describe("CalendarFeedRegistry", () => {
  it("keeps one feed per id and withdraws only the registered one", () => {
    const registry = new CalendarFeedRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const first = feed("todos");
    const withdrawFirst = registry.register(first);
    const second = feed("todos");
    registry.register(second);
    expect(registry.list()).toEqual([second]);
    withdrawFirst();
    expect(registry.list()).toEqual([second]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("droppedDate", () => {
  it("reads the date of a calendar day and ignores everything else", () => {
    expect(droppedDate(drop({ ...dateDropData("2026-10-12") }))).toBe("2026-10-12");
    expect(droppedDate(drop({ ...dateDropData("2026-10-12") }, true))).toBeNull();
    expect(droppedDate(drop({ kind: "todo-row" }))).toBeNull();
    expect(droppedDate(drop(null))).toBeNull();
  });
});
