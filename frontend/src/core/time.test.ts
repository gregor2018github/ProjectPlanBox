import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  formatDayLong,
  formatDayShort,
  formatMinutes,
  formatRelativeDay,
  isoWeekday,
  parseMinutes,
  startOfDayUtc,
  startOfWeekOf,
  todayIn,
  zonedInstant,
  zonedParts,
} from "./time";

describe("todayIn", () => {
  it("uses the configured zone, not UTC", () => {
    // 22:30 UTC on 8 Oct is already 9 Oct in Amsterdam (UTC+2 in summer time).
    const instant = new Date("2026-10-08T22:30:00Z");
    expect(todayIn("Europe/Amsterdam", instant)).toBe("2026-10-09");
    expect(todayIn("UTC", instant)).toBe("2026-10-08");
  });

  it("handles the DST switch", () => {
    // 25 Oct 2026: clocks go back at 01:00 UTC.
    expect(todayIn("Europe/Amsterdam", new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
    expect(todayIn("Europe/Amsterdam", new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
});

describe("startOfWeekOf", () => {
  it("starts weeks on Monday", () => {
    expect(startOfWeekOf("2026-10-08")).toBe("2026-10-05");
    expect(startOfWeekOf("2026-10-05")).toBe("2026-10-05");
    expect(startOfWeekOf("2026-10-11")).toBe("2026-10-05");
  });
});

describe("formatting", () => {
  it("formats long and short days", () => {
    expect(formatDayLong("2026-10-08")).toBe("Thursday, 8 October");
    expect(formatDayShort("2026-10-08")).toBe("Thu 8 Oct");
  });
});

describe("startOfDayUtc", () => {
  it("converts local midnight to UTC, DST-aware", () => {
    expect(startOfDayUtc("2026-10-08", "Europe/Amsterdam")).toBe("2026-10-07T22:00:00.000Z");
    expect(startOfDayUtc("2026-12-01", "Europe/Amsterdam")).toBe("2026-11-30T23:00:00.000Z");
  });
});

describe("day arithmetic", () => {
  it("adds days across months and measures distances", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-10-08", "2026-10-15")).toBe(7);
    expect(isoWeekday("2026-10-11")).toBe(7);
  });

  it("labels days relative to today", () => {
    const today = "2026-10-08";
    expect(formatRelativeDay("2026-10-08", today)).toBe("Today");
    expect(formatRelativeDay("2026-10-09", today)).toBe("Tomorrow");
    expect(formatRelativeDay("2026-10-07", today)).toBe("Yesterday");
    expect(formatRelativeDay("2026-10-12", today)).toBe("Monday");
    expect(formatRelativeDay("2026-10-20", today)).toBe("Tue 20 Oct");
    expect(formatRelativeDay("2027-01-04", today)).toBe("4 Jan 2027");
  });
});

describe("zoned times", () => {
  it("reads an instant as local date and minutes", () => {
    expect(zonedParts("2026-10-08T07:30:00.000Z", "Europe/Amsterdam")).toEqual({
      date: "2026-10-08",
      minutes: 9 * 60 + 30,
    });
    expect(zonedParts("2026-10-08T22:30:00.000Z", "Europe/Amsterdam").date).toBe("2026-10-09");
  });

  it("builds instants from local wall-clock time across DST", () => {
    expect(zonedInstant("2026-10-24", 9 * 60, "Europe/Amsterdam")).toBe("2026-10-24T07:00:00.000Z");
    expect(zonedInstant("2026-10-26", 9 * 60, "Europe/Amsterdam")).toBe("2026-10-26T08:00:00.000Z");
    // Minutes past midnight roll into the next day.
    expect(zonedInstant("2026-10-24", 1440 + 60, "Europe/Amsterdam")).toBe(
      zonedInstant("2026-10-25", 60, "Europe/Amsterdam"),
    );
  });

  it("formats and parses times of day", () => {
    expect(formatMinutes(9 * 60 + 5)).toBe("09:05");
    expect(formatMinutes(1440)).toBe("24:00");
    expect(parseMinutes("9:05")).toBe(545);
    expect(parseMinutes("24:00")).toBeNull();
    expect(parseMinutes("nine")).toBeNull();
  });

  it("adds months and clamps the day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-10", -10)).toBe("2025-12-10");
  });
});
