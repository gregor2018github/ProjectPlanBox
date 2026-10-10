import { describe, expect, it } from "vitest";

import {
  buildRule,
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
    expect(parseRule("FREQ=MONTHLY;BYMONTHDAY=1,15", START, TZ)).toBeNull();
    expect(parseRule("FREQ=MONTHLY;BYDAY=1MO", START, TZ)).toBeNull();
    expect(repeatOf("FREQ=MONTHLY;BYMONTHDAY=1,15", START, TZ)).toEqual({
      kind: "custom",
      rule: "FREQ=MONTHLY;BYMONTHDAY=1,15",
    });
    expect(ruleOf({ kind: "none" }, START)).toBeNull();
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
