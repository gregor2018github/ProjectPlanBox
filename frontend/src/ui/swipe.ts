/**
 * The rules of a row swipe (see {@link SwipeRow}), kept apart from the
 * component so they can be tested without touch events.
 *
 * A touch on a row can turn into a scroll, a drag (dnd-kit, after a
 * {@link TOUCH_HOLD} hold) or a swipe. A swipe must go sideways past
 * `start` before the hold is up; `start` is beyond the hold's tolerance, so
 * by then dnd-kit has given the touch up and the two never both run.
 */
import { TOUCH_HOLD } from "./touchHold";

/** Distances in px. */
export const SWIPE = {
  /** Sideways travel that makes a touch a swipe (more than the hold's tolerance). */
  start: TOUCH_HOLD.tolerance + 2,
  /** Touches starting this close to a screen edge belong to the system (Android's back gesture). */
  edge: 24,
  /** The swipe acts once it has gone this share of the row's width, within the bounds below. */
  commitShare: 0.3,
  minCommit: 64,
  maxCommit: 120,
} as const;

/** The way the finger moves: "right" or "left". */
export type SwipeDirection = "right" | "left";

/** What a touch is so far. */
export type SwipeIntent = "pending" | "swipe" | "other";

/**
 * Decides what a touch is from how far it has moved and for how long.
 *
 * @param dx Sideways travel since the touch started (px).
 * @param dy Vertical travel since the touch started (px).
 * @param elapsed Time since the touch started (ms).
 * @returns "swipe" once it clearly goes sideways in time, "other" once it is
 *   a scroll or a hold (for dragging), "pending" until then.
 */
export function swipeIntent(dx: number, dy: number, elapsed: number): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > SWIPE.start && ay >= ax) return "other";
  if (ax > SWIPE.start) return elapsed <= TOUCH_HOLD.value && ax > 1.5 * ay ? "swipe" : "other";
  return elapsed > TOUCH_HOLD.value ? "other" : "pending";
}

/**
 * How far a swipe must go to act.
 *
 * @param width The row's width (px).
 * @returns The distance in px.
 */
export function commitDistance(width: number): number {
  return Math.min(SWIPE.maxCommit, Math.max(SWIPE.minCommit, width * SWIPE.commitShare));
}

/**
 * Where the row sits while swiping: it follows the finger, but only in a
 * direction that has an action, and never further than its own width.
 *
 * @param dx Sideways travel since the swipe started (px).
 * @param allowed The directions that have an action.
 * @param width The row's width (px; 0 when unknown).
 * @returns The row's offset in px.
 */
export function swipeOffset(
  dx: number,
  allowed: Readonly<Record<SwipeDirection, boolean>>,
  width: number,
): number {
  const limit = width > 0 ? width : Number.POSITIVE_INFINITY;
  if (dx > 0) return allowed.right ? Math.min(dx, limit) : 0;
  if (dx < 0) return allowed.left ? Math.max(dx, -limit) : 0;
  return 0;
}

/**
 * The action a released swipe triggers.
 *
 * @param offset The row's offset when the finger lifted (px).
 * @param width The row's width (px).
 * @returns The direction to act on, or null to spring back without acting.
 */
export function releasedSwipe(offset: number, width: number): SwipeDirection | null {
  if (Math.abs(offset) < commitDistance(width)) return null;
  return offset > 0 ? "right" : "left";
}
