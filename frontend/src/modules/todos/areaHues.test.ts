import { describe, expect, it } from "vitest";

import { AREA_HUES, nextAreaHue } from "./areaHues";

describe("nextAreaHue", () => {
  it("takes the first default hue not in use", () => {
    expect(nextAreaHue([])).toBe(264);
    expect(nextAreaHue([264, 7])).toBe(155);
    expect(nextAreaHue([155])).toBe(264);
  });

  it("cycles by area count once every default is taken", () => {
    expect(nextAreaHue(AREA_HUES)).toBe(264);
    expect(nextAreaHue([...AREA_HUES, 1])).toBe(155);
  });
});
