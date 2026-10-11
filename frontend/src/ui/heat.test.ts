import { describe, expect, it } from "vitest";

import { heatLevel } from "./heat";

describe("heatLevel", () => {
  it("keeps zero empty and never shows a real value as empty", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(3, 0)).toBe(0);
  });

  it("splits the range into four steps", () => {
    expect([2, 5, 7, 10].map((v) => heatLevel(v, 10))).toEqual([1, 2, 3, 4]);
  });
});
