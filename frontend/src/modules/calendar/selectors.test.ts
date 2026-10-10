import { describe, expect, it } from "vitest";

import type { CalendarFeed } from "../../core/calendar/feed";
import {
  agendaDays,
  barInTimeGrid,
  daysFrom,
  entryItems,
  itemsByDay,
  layoutBars,
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
    const allDay = itemOf(makeAllDay("2026-10-08", "2026-10-08", { title: "Trip" }));
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
    range: { startDate: "2026-10-08", start, endDate: "2026-10-08", end },
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

describe("multi-day events", () => {
  // Mon 12 Oct 06:00 to Thu 15 Oct 22:00, Amsterdam (UTC+2).
  const trip = itemOf(
    makeEvent({
      title: "Trip",
      start_at: "2026-10-12T04:00:00.000Z",
      end_at: "2026-10-15T20:00:00.000Z",
    }),
  );
  const week = daysFrom("2026-10-12", 7);

  it("puts every day of a multi-day occurrence in `spanning`, with its whole range", () => {
    const byDay = itemsByDay(week, [trip], [], TZ);
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) {
      expect(byDay.get(day)?.spanning.map((s) => s.item.key)).toEqual([trip.key]);
      expect(byDay.get(day)?.allDay).toEqual([]);
      expect(byDay.get(day)?.timed).toEqual([]);
    }
    expect(byDay.get("2026-10-12")?.spanning[0]?.range).toEqual({
      startDate: "2026-10-12",
      start: 6 * 60,
      endDate: "2026-10-15",
      end: 22 * 60,
    });
  });

  it("lays it out as one bar per week row, marking where it continues", () => {
    const allDay = itemOf(makeAllDay("2026-10-14", "2026-10-20", { title: "Holiday" }));
    const byDay = itemsByDay(week, [trip, allDay], [], TZ);
    const { bars, lanes } = layoutBars(week, byDay);
    expect(lanes).toBe(2);
    expect(bars.map((b) => [b.segment.item.event.title, b.from, b.to, b.lane])).toEqual([
      ["Trip", 0, 3, 0],
      ["Holiday", 2, 6, 1],
    ]);
    expect(bars[1]).toMatchObject({ continuesBefore: false, continuesAfter: true });

    const next = daysFrom("2026-10-19", 7);
    const later = layoutBars(next, itemsByDay(next, [trip, allDay], [], TZ));
    expect(later.bars.map((b) => [b.from, b.to, b.lane, b.continuesBefore])).toEqual([
      [0, 1, 0, true],
    ]);
  });

  it("reuses a lane once the earlier bar has ended", () => {
    const a = itemOf(makeAllDay("2026-10-12", "2026-10-13"));
    const b = itemOf(makeAllDay("2026-10-14", "2026-10-16"));
    const { bars, lanes } = layoutBars(week, itemsByDay(week, [a, b], [], TZ));
    expect(lanes).toBe(1);
    expect(bars.map((bar) => bar.lane)).toEqual([0, 0]);
  });

  it("keeps short overnight events in the time grid and long ones in the all-day row", () => {
    const overnight = itemOf(
      makeEvent({ start_at: "2026-10-08T20:00:00.000Z", end_at: "2026-10-09T08:00:00.000Z" }),
    );
    const [night] = segmentsOf(overnight, TZ);
    const [long] = segmentsOf(trip, TZ);
    expect(night && barInTimeGrid(night)).toBe(false);
    expect(long && barInTimeGrid(long)).toBe(true);
  });

  it("lists it once in the agenda, on the first day shown", () => {
    const days = daysFrom("2026-10-13", 4);
    const agenda = agendaDays(days, itemsByDay(days, [trip], [], TZ));
    expect(days.map((d) => agenda.get(d)?.spanning.length)).toEqual([1, 0, 0, 0]);
  });
});
