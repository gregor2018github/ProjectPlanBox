import { describe, expect, it } from "vitest";

import { hueAt, hueName, normalizeHue, tintProps } from "./tint";

const rect = { left: 0, top: 0, width: 100, height: 100 };

describe("tint", () => {
  it("wraps any angle into whole degrees 0–359", () => {
    expect([
      normalizeHue(360),
      normalizeHue(-30),
      normalizeHue(264.4),
      normalizeHue(719.6),
    ]).toEqual([0, 330, 264, 0]);
  });

  it("reads the wheel clockwise from the top", () => {
    expect(hueAt(50, 0, rect)).toBe(0);
    expect(hueAt(100, 50, rect)).toBe(90);
    expect(hueAt(50, 100, rect)).toBe(180);
    expect(hueAt(0, 50, rect)).toBe(270);
  });

  it("sets the hue variable on a tint scope", () => {
    expect(tintProps(-96)).toEqual({ "data-tint": "", style: { "--tint-hue": "264" } });
  });

  it("names hues roughly", () => {
    expect([hueName(30), hueName(155), hueName(264), hueName(355)]).toEqual([
      "red",
      "green",
      "indigo",
      "pink",
    ]);
  });
});
