import { describe, expect, it } from "vitest";

import { daysEnding } from "./days";
import { habitRate, rate30, sumRates, weekdayRates, weeklyCheckins } from "./insights";
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
    scheduled: daysEnding("2026-10-11", 11), // 1-11 Oct
    current_streak: 0,
    best_streak: 0,
    total_checkins: 0,
    ...fields,
  };
}

describe("habit rates", () => {
  it("counts scheduled days up to today; an unchecked today does not count yet", () => {
    const h = habit({ checkins: ["2026-10-01", "2026-10-02", "2026-10-07"] });
    expect(rate30(h, TODAY)).toEqual({ done: 3, due: 7 }); // 1-7 Oct
  });

  it("counts a checked today", () => {
    const h = habit({ checkins: ["2026-10-08"] });
    expect(habitRate(h, TODAY, "2026-10-08")).toEqual({ done: 1, due: 1 });
  });

  it("adds rates up", () => {
    expect(
      sumRates([
        { done: 1, due: 2 },
        { done: 3, due: 4 },
      ]),
    ).toEqual({ done: 4, due: 6 });
  });
});

describe("weekdayRates", () => {
  it("splits consistency by weekday, Monday first", () => {
    const h = habit({ checkins: ["2026-10-05", "2026-10-06"] }); // Mon, Tue
    const rates = weekdayRates([h], TODAY);
    expect(rates[0]).toEqual({ done: 1, due: 1 }); // Monday 5 Oct
    expect(rates[3]).toEqual({ done: 0, due: 1 }); // Thursday 1 Oct only; today is open
  });
});

describe("weeklyCheckins", () => {
  it("counts check-ins per cached week, unscheduled ones too", () => {
    const h = habit({ checkins: ["2026-09-30", "2026-10-05", "2026-10-06"], scheduled: [] });
    const weeks = weeklyCheckins([h], TODAY);
    expect(weeks).toHaveLength(26);
    expect(weeks.at(-1)).toEqual({ start: "2026-10-05", count: 2 });
    expect(weeks.at(-2)).toEqual({ start: "2026-09-28", count: 1 });
  });
});
