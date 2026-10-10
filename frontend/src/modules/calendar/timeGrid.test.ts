import { describe, expect, it } from "vitest";

import {
  HOUR_HEIGHT,
  minutesAt,
  moveBy,
  PX_PER_MINUTE,
  resizeBy,
  selection,
  snap,
} from "./timeGrid";

const px = (minutes: number) => minutes * PX_PER_MINUTE;

describe("time grid geometry", () => {
  it("snaps to quarter hours and clamps to the day", () => {
    expect(snap(52)).toBe(45);
    expect(snap(53)).toBe(60);
    expect(minutesAt(HOUR_HEIGHT * 9 + 1)).toBe(540);
    expect(minutesAt(-20)).toBe(0);
    expect(minutesAt(HOUR_HEIGHT * 30)).toBe(1440);
  });

  it("moves keeping the length, and never starts outside the day", () => {
    expect(moveBy({ start: 540, end: 600 }, px(35))).toEqual({ start: 570, end: 630 });
    expect(moveBy({ start: 60, end: 120 }, px(-300))).toEqual({ start: 0, end: 60 });
    expect(moveBy({ start: 1380, end: 1440 }, px(300))).toEqual({ start: 1425, end: 1485 });
  });

  it("resizes to at least one step and at most midnight", () => {
    expect(resizeBy({ start: 540, end: 600 }, px(-120))).toEqual({ start: 540, end: 555 });
    expect(resizeBy({ start: 540, end: 600 }, px(30))).toEqual({ start: 540, end: 630 });
    expect(resizeBy({ start: 1380, end: 1440 }, px(60))).toEqual({ start: 1380, end: 1440 });
  });

  it("selects between press and pointer in either direction", () => {
    expect(selection(px(600), px(540))).toEqual({ start: 540, end: 600 });
    expect(selection(px(540), px(542))).toEqual({ start: 540, end: 555 });
  });
});
