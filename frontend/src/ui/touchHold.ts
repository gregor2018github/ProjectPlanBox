/**
 * Keeps the browser from taking a touch for scrolling while the finger
 * rests on something draggable, so dnd-kit's hold can pick it up.
 *
 * Android's WebView claims a touch for scrolling once the finger drifts
 * about 8 dp, and cancels the pointer (`pointercancel`) long before the
 * 250 ms hold that starts a drag. A finger never holds perfectly still, so
 * touch drags often failed and the long-press menu opened instead. While a
 * touch on a drag source has moved less than {@link TOUCH_HOLD}'s
 * tolerance, its moves are not the browser's; a swipe to scroll moves
 * further at once and scrolls as before.
 */

/** dnd-kit's touch activation: hold this long, straying at most this far (px). */
export const TOUCH_HOLD = { value: 250, tolerance: 12 };

/** Marks an element a drag source (set by the `ui/dnd` hooks). */
export const DRAG_SOURCE_ATTR = "data-drag-source";

/**
 * Whether the event that asks a context menu to open came from a finger:
 * Base UI's own long-press timer (a touch event) or the browser's
 * long-press `contextmenu` (a touch pointer event).
 *
 * @param event The event behind the open request.
 * @returns True for a touch long-press.
 */
export function isTouchOpen(event: Event | undefined): boolean {
  if (event === undefined) return false;
  if (event.type.startsWith("touch")) return true;
  return typeof PointerEvent !== "undefined" && event instanceof PointerEvent
    ? event.pointerType === "touch"
    : false;
}

/**
 * Installs the guard on `target` (the document).
 *
 * @returns A function that removes it.
 */
export function installTouchHoldGuard(target: Document = document): () => void {
  let start: { x: number; y: number; time: number } | null = null;

  const onStart = (event: TouchEvent) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    const source =
      event.target instanceof Element ? event.target.closest(`[${DRAG_SOURCE_ATTR}]`) : null;
    start = touch && source ? { x: touch.clientX, y: touch.clientY, time: event.timeStamp } : null;
  };
  const onMove = (event: TouchEvent) => {
    if (start === null) return;
    const touch = event.touches[0];
    const strayed =
      touch === undefined ||
      Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TOUCH_HOLD.tolerance;
    if (strayed || event.timeStamp - start.time > TOUCH_HOLD.value) {
      // A swipe (or a drag dnd-kit has taken over): leave it alone from now on.
      start = null;
      return;
    }
    if (event.cancelable) event.preventDefault();
  };
  const onEnd = () => {
    start = null;
  };

  target.addEventListener("touchstart", onStart, { capture: true, passive: true });
  target.addEventListener("touchmove", onMove, { capture: true, passive: false });
  target.addEventListener("touchend", onEnd, { capture: true });
  target.addEventListener("touchcancel", onEnd, { capture: true });
  return () => {
    target.removeEventListener("touchstart", onStart, { capture: true });
    target.removeEventListener("touchmove", onMove, { capture: true });
    target.removeEventListener("touchend", onEnd, { capture: true });
    target.removeEventListener("touchcancel", onEnd, { capture: true });
  };
}
