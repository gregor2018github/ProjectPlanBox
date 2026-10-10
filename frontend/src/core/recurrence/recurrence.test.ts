import { describe, expect, it } from "vitest";

import {
  buildRule,
  dayOrdinal,
  defaultSpec,
  describeRule,
  nthWeekdayOf,
  parseRule,
  repeatOf,
  ruleOf,
  shiftRule,
} from "./recurrence";
const TZ = "Europe/Amsterdam";

// Thursday 8 October 2026 is the second Thursday of the month.
const START = "2026-10-08";

describe("parseRule / buildRule", () => {
  it("round-trips what the dialog can express", () => {
    for (const rule of [
      "FREQ=DAILY",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
      "FREQ=MONTHLY;BYDAY=2TH",
      "FREQ=MONTHLY;COUNT=5",
      "FREQ=YEARLY;UNTIL=20271231",
    ]) {
      const spec = parseRule(rule, START, TZ);
      expect(spec).not.toBeNull();
      if (spec) expect(buildRule(spec, START)).toBe(rule);
    }
  });

  it("writes a weekly rule on the start's own weekday without BYDAY", () => {
    expect(buildRule(defaultSpec("WEEKLY", START), START)).toBe("FREQ=WEEKLY");
  });

  it("reads a server UNTIL instant back as the local end date", () => {
    const spec = parseRule("FREQ=DAILY;UNTIL=20261231T225959Z", START, TZ);
    expect(spec?.end).toEqual({ kind: "until", date: "2026-12-31" });
  });

  it("leaves rules it cannot edit to be kept as they are", () => {
    expect(parseRule("FREQ=MONTHLY;BYDAY=1MO", START, TZ)).toBeNull();
    expect(parseRule("FREQ=WEEKLY;BYMONTHDAY=1", START, TZ)).toBeNull();
    expect(parseRule("FREQ=MONTHLY;BYMONTHDAY=0", START, TZ)).toBeNull();
    expect(repeatOf("FREQ=MONTHLY;BYDAY=1MO", START, TZ)).toEqual({
      kind: "custom",
      rule: "FREQ=MONTHLY;BYDAY=1MO",
    });
    expect(ruleOf({ kind: "none" }, START)).toBeNull();
  });
});

describe("days of the month", () => {
  it("reads and writes several days, the last day after the numbered ones", () => {
    const spec = parseRule("FREQ=MONTHLY;BYMONTHDAY=15,1", START, TZ);
    expect(spec?.monthly).toBe("days");
    expect(spec?.byMonthDay).toEqual([1, 15]);
    if (spec) {
      expect(buildRule({ ...spec, byMonthDay: [-1, 15, 1] }, START)).toBe(
        "FREQ=MONTHLY;BYMONTHDAY=1,15,-1",
      );
    }
  });

  it("treats the start's own day alone as plain monthly", () => {
    expect(parseRule("FREQ=MONTHLY;BYMONTHDAY=8", START, TZ)?.monthly).toBe("day");
    const spec = { ...defaultSpec("MONTHLY", START), monthly: "days" as const };
    expect(buildRule(spec, START)).toBe("FREQ=MONTHLY");
  });

  it("describes month days and counts from completion", () => {
    expect(describeRule("FREQ=MONTHLY;BYMONTHDAY=1,15,-1", START, TZ)).toBe(
      "Every month on the 1st, 15th and last day",
    );
    expect(describeRule("FREQ=MONTHLY;BYMONTHDAY=22", START, TZ)).toBe("Every month on the 22nd");
    expect(describeRule("FREQ=DAILY;INTERVAL=3", START, TZ, true)).toBe(
      "Every 3 days after completion",
    );
    expect([1, 2, 3, 4, 11, 12, 13, 21, 23, -1].map(dayOrdinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "23rd",
      "last day",
    ]);
  });
});

describe("describeRule", () => {
  it("says what a rule does in words", () => {
    expect(describeRule("FREQ=DAILY", START, TZ)).toBe("Every day");
    expect(describeRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", START, TZ)).toBe(
      "Every week on weekdays",
    );
    expect(describeRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", START, TZ)).toBe(
      "Every 2 weeks on Mon, Thu",
    );
    expect(describeRule("FREQ=MONTHLY;BYDAY=2TH;COUNT=3", START, TZ)).toBe(
      "Every month on the second Thu, 3 times",
    );
    expect(describeRule("FREQ=YEARLY;UNTIL=20301008", START, TZ)).toBe(
      "Every year on 8 Oct, until 8 Oct 2030",
    );
  });
});

describe("weekdays", () => {
  it("knows the nth weekday and the last one", () => {
    expect(nthWeekdayOf("2026-10-08")).toBe(2);
    expect(nthWeekdayOf("2026-10-29")).toBe(-1);
  });

  it("shifts weekdays (keeping ordinals) when a series moves by days", () => {
    expect(shiftRule("FREQ=WEEKLY;BYDAY=MO,SU", 1)).toBe("FREQ=WEEKLY;BYDAY=TU,MO");
    expect(shiftRule("FREQ=MONTHLY;BYDAY=-1FR", -1)).toBe("FREQ=MONTHLY;BYDAY=-1TH");
    expect(shiftRule("FREQ=MONTHLY;BYMONTHDAY=31", 1)).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
    expect(shiftRule("FREQ=DAILY", 3)).toBe("FREQ=DAILY");
  });
});
