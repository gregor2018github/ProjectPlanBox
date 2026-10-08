import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  formatDayLong,
  formatDayShort,
  formatRelativeDay,
  isoWeekday,
  startOfDayUtc,
  startOfWeekOf,
  todayIn,
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
