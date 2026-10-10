/**
 * Geometry of the week/day time grid: pixels to minutes, snapping, and the
 * outcome of dragging an event's body or bottom edge. Pure, so it is tested
 * without a browser.
 */
import { MINUTES_PER_DAY } from "../../core/time";

/** Height of one hour in pixels. */
export const HOUR_HEIGHT = 48;

/** Times snap to quarter hours. */
export const SNAP_MINUTES = 15;

/** Pixels per minute. */
export const PX_PER_MINUTE = HOUR_HEIGHT / 60;

/** A pointer travel shorter than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** A time span within one day, in minutes since midnight. */
export interface MinuteSpan {
  start: number;
  end: number;
}

/** Rounds minutes to the nearest snap step. */
export function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** The snapped time at a vertical offset in the grid, clamped to the day. */
export function minutesAt(offsetY: number): number {
  return Math.min(Math.max(snap(offsetY / PX_PER_MINUTE), 0), MINUTES_PER_DAY);
}

/**
 * Moving an event by a pointer delta: it keeps its length and snaps; its
 * start stays within the day (it may end after midnight).
 */
export function moveBy(span: MinuteSpan, deltaY: number): MinuteSpan {
  const length = span.end - span.start;
  const start = Math.min(
    Math.max(snap(span.start + deltaY / PX_PER_MINUTE), 0),
    MINUTES_PER_DAY - SNAP_MINUTES,
  );
  return { start, end: start + length };
}

/** Resizing from the bottom edge: at least one snap step long, at most until midnight. */
export function resizeBy(span: MinuteSpan, deltaY: number): MinuteSpan {
  const end = Math.min(
    Math.max(snap(span.end + deltaY / PX_PER_MINUTE), span.start + SNAP_MINUTES),
    MINUTES_PER_DAY,
  );
  return { start: span.start, end };
}

/** Dragging over empty grid to create: from the press to the pointer, at least one step. */
export function selection(fromY: number, toY: number): MinuteSpan {
  const start = Math.min(minutesAt(Math.min(fromY, toY)), MINUTES_PER_DAY - SNAP_MINUTES);
  const end = Math.max(minutesAt(Math.max(fromY, toY)), start + SNAP_MINUTES);
  return { start, end };
}
