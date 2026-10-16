import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DRAG_SOURCE_ATTR, installTouchHoldGuard } from "./touchHold";

/** A cancelable touch event at one point (jsdom has no Touch constructor). */
function touch(type: string, target: Element, at: { x: number; y: number }, time: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = type === "touchend" ? [] : [{ clientX: at.x, clientY: at.y }];
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "timeStamp", { value: time });
  target.dispatchEvent(event);
  return event;
}

let remove: () => void;
let row: HTMLElement;
let plain: HTMLElement;

beforeEach(() => {
  row = document.createElement("li");
  row.setAttribute(DRAG_SOURCE_ATTR, "");
  plain = document.createElement("p");
  document.body.append(row, plain);
  remove = installTouchHoldGuard();
});

afterEach(() => {
  remove();
  row.remove();
  plain.remove();
});

describe("installTouchHoldGuard", () => {
  it("holds the browser back while a finger rests on a drag source", () => {
    touch("touchstart", row, { x: 100, y: 100 }, 0);
    expect(touch("touchmove", row, { x: 106, y: 108 }, 80).defaultPrevented).toBe(true);
  });

  it("lets a swipe scroll once the finger strays past the tolerance", () => {
    touch("touchstart", row, { x: 100, y: 100 }, 0);
    expect(touch("touchmove", row, { x: 100, y: 130 }, 40).defaultPrevented).toBe(false);
    // Coming back near the start does not re-arm it.
    expect(touch("touchmove", row, { x: 100, y: 102 }, 60).defaultPrevented).toBe(false);
  });

  it("stops after the hold, when dnd-kit has the touch", () => {
    touch("touchstart", row, { x: 100, y: 100 }, 0);
    expect(touch("touchmove", row, { x: 102, y: 102 }, 300).defaultPrevented).toBe(false);
  });

  it("leaves touches elsewhere alone", () => {
    touch("touchstart", plain, { x: 100, y: 100 }, 0);
    expect(touch("touchmove", plain, { x: 102, y: 102 }, 50).defaultPrevented).toBe(false);
  });
});
