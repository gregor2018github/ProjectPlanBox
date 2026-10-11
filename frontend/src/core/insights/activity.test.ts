import { describe, expect, it } from "vitest";

import {
  activeStreaks,
  activityColumns,
  activityRange,
  busiestWeekday,
  describeDay,
  type DayActivity,
} from "./activity";

const TODAY = "2026-10-08"; // a Thursday

function day(date: string, created = 1, completed = 0, deleted = 0, opens = 0): DayActivity {
  return { date, created, completed, deleted, opens };
}

describe("activityRange", () => {
  it("covers 53 whole weeks ending with today's week", () => {
    expect(activityRange(TODAY)).toEqual({ start: "2025-10-06", end: TODAY });
  });
});

describe("activityColumns", () => {
  const columns = activityColumns([day("2026-10-07", 2, 3, 1)], TODAY);

  it("lays out weeks as columns and leaves days after today blank", () => {
    expect(columns).toHaveLength(53);
    const thisWeek = columns.at(-1)!;
    expect(thisWeek.cells.map((c) => c?.value ?? null)).toEqual([0, 0, 6, 0, null, null, null]);
  });

  it("labels the week in which a month starts", () => {
    expect(columns.at(-2)!.tick).toBe("Oct"); // 28 Sep - 4 Oct holds 1 Oct
    expect(columns.at(-1)!.tick).toBeUndefined();
  });
});

describe("describeDay", () => {
  it("lists only what happened", () => {
    expect(describeDay("2026-10-07", day("2026-10-07", 2, 0, 0, 1))).toBe(
      "Wed 7 Oct 2026 · 2 added · 1 app open",
    );
    expect(describeDay("2026-10-06", undefined)).toBe("Tue 6 Oct 2026 · Nothing");
  });
});

describe("activeStreaks", () => {
  it("counts runs of active days; an empty today does not break the run", () => {
    const days = [
      day("2026-10-01"),
      day("2026-10-02"),
      day("2026-10-03"),
      day("2026-10-06"),
      day("2026-10-07"),
      day("2026-10-05", 0, 0, 0, 3), // only opened: not active
    ];
    expect(activeStreaks(days, TODAY)).toEqual({ current: 2, longest: 3, activeDays: 5 });
  });
});

describe("busiestWeekday", () => {
  it("names the weekday with the most done", () => {
    expect(busiestWeekday([day("2026-10-06", 1), day("2026-10-08", 4)])).toBe("Thu");
    expect(busiestWeekday([])).toBeNull();
  });
});
