import { useRef, type TouchEvent } from "react";

/** How far a finger must travel sideways for a swipe, in px. */
export const SWIPE_DISTANCE = 60;
/** Touches starting this close to a screen edge belong to the system (Android's back gesture). */
export const SWIPE_EDGE = 24;

/**
 * Touch handlers for swiping between periods: a swipe to the left shows the
 * next one, to the right the previous one. Mostly vertical moves are left to
 * scrolling, and touches on an element marked `data-swipe-ignore` (e.g. an
 * event's resize handle) do nothing.
 */
export function useSwipeNavigation(onPrevious: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0];
      const ignored =
        event.target instanceof Element && event.target.closest("[data-swipe-ignore]") !== null;
      start.current =
        event.touches.length !== 1 ||
        touch === undefined ||
        ignored ||
        touch.clientX < SWIPE_EDGE ||
        touch.clientX > window.innerWidth - SWIPE_EDGE
          ? null
          : { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (from === null || touch === undefined) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return;
      if (dx < 0) onNext();
      else onPrevious();
    },
    onTouchCancel: () => {
      start.current = null;
    },
  };
}
