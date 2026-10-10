import { describe, expect, it } from "vitest";

import { applyChecked } from "./apply";
import { dayState, daysEnding, habitRange, historyWeeks, HISTORY_WEEKS, isDueToday } from "./days";
import type { Habit } from "./types";

const TODAY = "2026-10-08"; // a Thursday

function habit(fields: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Stretch",
    notes: "",
    rrule: "FREQ=DAILY",
    start_date: "2026-10-01",
    position: "a0",
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    checkins: [],
    scheduled: [],
    current_streak: 0,
    best_streak: 0,
    total_checkins: 0,
    ...fields,
  };
}

describe("habit days", () => {
  it("caches whole Monday-first weeks ending with the current one", () => {
    const range = habitRange(TODAY);
    expect(range.end).toBe("2026-10-11");
    expect(range.start).toBe("2026-04-13");
    const weeks = historyWeeks(TODAY);
    expect(weeks).toHaveLength(HISTORY_WEEKS);
    expect(weeks[0]?.[0]).toBe(range.start);
    expect(weeks.at(-1)?.at(-1)).toBe(range.end);
  });

  it("lists the days ending today", () => {
    expect(daysEnding(TODAY, 3)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
  });

  it("classifies days", () => {
    const h = habit({
      scheduled: ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      checkins: ["2026-10-06", "2026-10-05"],
    });
    expect(dayState(h, "2026-10-06", TODAY)).toBe("done");
    expect(dayState(h, "2026-10-05", TODAY)).toBe("done");
    expect(dayState(h, "2026-10-07", TODAY)).toBe("missed");
    expect(dayState(h, "2026-10-08", TODAY)).toBe("open");
    expect(dayState(h, "2026-10-09", TODAY)).toBe("future");
    expect(dayState(h, "2026-10-04", TODAY)).toBe("unscheduled");
    expect(isDueToday(h, TODAY)).toBe(true);
    expect(isDueToday(habit({ scheduled: [TODAY], checkins: [TODAY] }), TODAY)).toBe(false);
  });
});

describe("applyChecked", () => {
  it("checking a scheduled today extends the streak at once", () => {
    const h = habit({ scheduled: [TODAY], current_streak: 3, best_streak: 3, total_checkins: 3 });
    const [checked] = applyChecked([h], "h1", TODAY, true, TODAY);
    expect(checked).toMatchObject({
      checkins: [TODAY],
      current_streak: 4,
      best_streak: 4,
      total_checkins: 4,
    });
    const [unchecked] = applyChecked([checked as Habit], "h1", TODAY, false, TODAY);
    expect(unchecked).toMatchObject({ checkins: [], current_streak: 3, total_checkins: 3 });
  });

  it("leaves streaks alone for other days, and ignores no-op toggles", () => {
    const h = habit({ scheduled: ["2026-10-07"], current_streak: 2, checkins: ["2026-10-07"] });
    expect(applyChecked([h], "h1", "2026-10-07", true, TODAY)[0]).toBe(h);
    const [out] = applyChecked([h], "h1", "2026-10-07", false, TODAY);
    expect(out?.current_streak).toBe(2);
    expect(out?.checkins).toEqual([]);
  });
});
