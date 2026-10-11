import { describe, expect, it } from "vitest";

import { formatDays, formatDelta, formatPercent, plural } from "./format";

describe("formatDays", () => {
  it("picks minutes, hours or days", () => {
    expect(formatDays(0.01)).toBe("14 min");
    expect(formatDays(0.25)).toBe("6 h");
    expect(formatDays(2.44)).toBe("2.4 days");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(1234.4)).toBe("1,234 days");
  });

  it("shows a dash for nothing measured", () => {
    expect(formatDays(null)).toBe("–");
  });
});

describe("formatPercent and formatDelta", () => {
  it("rounds shares and guards against an empty whole", () => {
    expect(formatPercent(2, 3)).toBe("67 %");
    expect(formatPercent(1, 0)).toBe("–");
  });

  it("signs the change", () => {
    expect(formatDelta(5, 2, "last week")).toBe("+3 vs last week");
    expect(formatDelta(2, 5, "last week")).toBe("−3 vs last week");
    expect(formatDelta(4, 4, "last week")).toBe("Same as last week");
  });

  it("pluralises", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(1200, "day")).toBe("1,200 days");
  });
});
