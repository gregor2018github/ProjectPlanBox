import { describe, expect, it } from "vitest";

import { formatDayLong, formatDayShort, startOfWeekOf, todayIn } from "./time";

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
