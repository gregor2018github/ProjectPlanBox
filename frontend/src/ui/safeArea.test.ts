import { describe, expect, it } from "vitest";

import { safeCollisionPadding } from "./safeArea";

describe("safeCollisionPadding", () => {
  it("keeps the edge gap when there are no safe-area insets", () => {
    expect(safeCollisionPadding()).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
  });

  it("reuses the measurement until the window resizes", () => {
    const first = safeCollisionPadding();
    expect(safeCollisionPadding()).toBe(first);
    window.dispatchEvent(new Event("resize"));
    expect(safeCollisionPadding()).not.toBe(first);
  });
});
