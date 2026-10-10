import { describe, expect, it } from "vitest";

import type { CalendarFeed } from "../../core/calendar/feed";
import {
  entryItems,
  itemsByDay,
  layoutDay,
  mergeRanges,
  monthRange,
  monthsCovering,
  segmentsOf,
} from "./selectors";
import { itemOf, makeAllDay, makeEvent, TZ } from "./testData";
import { singleOccurrence } from "./timing";
import type { DaySegment } from "./types";

describe("months", () => {
  it("lists the months a range touches, across a year end", () => {
    expect(monthsCovering("2026-11-30", "2027-01-10")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(monthsCovering("2026-10-01", "2026-10-31")).toEqual(["2026-10"]);
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("merges cached months without duplicates", () => {
    const event = makeEvent();
    const range = { events: [event], occurrences: [singleOccurrence(event, TZ)] };
    expect(mergeRanges([range, range])).toHaveLength(1);
    // An occurrence whose event is missing is ignored.
    expect(mergeRanges([{ events: [], occurrences: range.occurrences }])).toEqual([]);
  });
});

describe("segmentsOf", () => {
  it("splits a timed event over the local days it touches", () => {
    const event = makeEvent({
      start_at: "2026-10-08T20:00:00.000Z", // 22:00 local
      end_at: "2026-10-09T08:00:00.000Z", // 10:00 local next day
    });
    expect(segmentsOf(itemOf(event), TZ).map((s) => [s.date, s.start, s.end])).toEqual([
      ["2026-10-08", 22 * 60, 1440],
      ["2026-10-09", 0, 10 * 60],
    ]);
  });

  it("keeps an event that ends at midnight on its own day", () => {
    const event = makeEvent({
      start_at: "2026-10-08T20:00:00.000Z",
      end_at: "2026-10-08T22:00:00.000Z", // 24:00 local
    });
    expect(segmentsOf(itemOf(event), TZ).map((s) => [s.date, s.end])).toEqual([
      ["2026-10-08", 1440],
    ]);
  });

  it("covers every day of an all-day event", () => {
    const event = makeAllDay("2026-10-08", "2026-10-10");
    expect(segmentsOf(itemOf(event), TZ).map((s) => s.date)).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
    ]);
  });
});

describe("itemsByDay", () => {
  it("sorts events into all-day and timed rows and adds feed entries", () => {
    const timed = itemOf(makeEvent({ title: "Meeting" }));
    const allDay = itemOf(makeAllDay("2026-10-07", "2026-10-09", { title: "Trip" }));
    const feed: CalendarFeed = {
      id: "todos",
      label: "Todos",
      entries: [
        { ref: "todos.todo:b", title: "Done", date: "2026-10-08", done: true, tone: "default" },
        { ref: "todos.todo:a", title: "Open", date: "2026-10-08", done: false, tone: "danger" },
      ],
      reschedule: () => undefined,
      toggleDone: () => undefined,
    };
    const byDay = itemsByDay(["2026-10-08"], [timed, allDay], entryItems([feed]), TZ);
    const day = byDay.get("2026-10-08");
    expect(day?.allDay.map((s) => s.item.event.title)).toEqual(["Trip"]);
    expect(day?.timed.map((s) => s.item.event.title)).toEqual(["Meeting"]);
    expect(day?.entries.map((e) => e.entry.title)).toEqual(["Open", "Done"]);
  });
});

describe("layoutDay", () => {
  const segment = (start: number, end: number): DaySegment => ({
    item: itemOf(makeEvent()),
    date: "2026-10-08",
    start,
    end,
  });

  it("puts overlapping events side by side and resets lanes after a gap", () => {
    const placed = layoutDay([
      segment(540, 600),
      segment(570, 630),
      segment(600, 660),
      segment(700, 720),
    ]);
    expect(placed.map((p) => [p.start, p.lane, p.lanes])).toEqual([
      [540, 0, 2],
      [570, 1, 2],
      [600, 0, 2],
      [700, 0, 1],
    ]);
  });
});
