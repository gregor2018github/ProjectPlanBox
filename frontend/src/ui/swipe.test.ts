import { describe, expect, it } from "vitest";

import { commitDistance, releasedSwipe, SWIPE, swipeIntent, swipeOffset } from "./swipe";
import { TOUCH_HOLD } from "./touchHold";

describe("swipeIntent", () => {
  it("waits while the finger has barely moved", () => {
    expect(swipeIntent(5, 3, 100)).toBe("pending");
  });

  it("is a swipe once it goes sideways past the start distance before the hold is up", () => {
    expect(swipeIntent(SWIPE.start + 1, 2, 100)).toBe("swipe");
    expect(swipeIntent(-(SWIPE.start + 1), 2, 100)).toBe("swipe");
  });

  it("leaves vertical moves to scrolling and diagonal ones alone", () => {
    expect(swipeIntent(3, SWIPE.start + 1, 100)).toBe("other");
    expect(swipeIntent(SWIPE.start + 2, SWIPE.start + 1, 100)).toBe("other");
  });

  it("leaves a hold to dragging", () => {
    expect(swipeIntent(2, 2, TOUCH_HOLD.value + 1)).toBe("other");
    expect(swipeIntent(SWIPE.start + 10, 0, TOUCH_HOLD.value + 1)).toBe("other");
  });

  it("starts beyond the hold's tolerance, so dnd-kit has let go first", () => {
    expect(SWIPE.start).toBeGreaterThan(TOUCH_HOLD.tolerance);
  });
});

describe("swipeOffset and releasedSwipe", () => {
  const both = { right: true, left: true };

  it("follows the finger, only towards an action and within the row", () => {
    expect(swipeOffset(50, both, 300)).toBe(50);
    expect(swipeOffset(-500, both, 300)).toBe(-300);
    expect(swipeOffset(50, { right: false, left: true }, 300)).toBe(0);
    expect(swipeOffset(-50, { right: true, left: false }, 300)).toBe(0);
  });

  it("acts past a share of the width, bounded for narrow and wide rows", () => {
    expect(commitDistance(300)).toBe(90);
    expect(commitDistance(0)).toBe(SWIPE.minCommit);
    expect(commitDistance(2000)).toBe(SWIPE.maxCommit);
    expect(releasedSwipe(89, 300)).toBeNull();
    expect(releasedSwipe(90, 300)).toBe("right");
    expect(releasedSwipe(-120, 300)).toBe("left");
  });
});
