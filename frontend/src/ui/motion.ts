/**
 * Motion presets (STYLE_GUIDE B1 "Motion"). Use these instead of inline
 * numbers; CSS transitions use the matching --duration-* / --ease-* tokens.
 */
import type { Transition } from "motion/react";

/** Durations in seconds, mirroring tokens.css. */
export const durations = { fast: 0.15, base: 0.2, slow: 0.25, exit: 0.15 } as const;

/** Cubic-bezier easings, mirroring tokens.css. */
export const easings = {
  out: [0.22, 1, 0.36, 1],
  in: [0.55, 0, 1, 0.45],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Springs for layout changes: reordering, completing, items making room. */
export const springs = {
  layout: { type: "spring", visualDuration: 0.22, bounce: 0.1 },
  snappy: { type: "spring", visualDuration: 0.18, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** Width/opacity transition for panels that slide in and out (sidebar, detail panel). */
export const panelTransition: Transition = {
  duration: durations.slow,
  ease: easings.inOut,
};
