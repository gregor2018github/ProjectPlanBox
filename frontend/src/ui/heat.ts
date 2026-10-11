/** The one-hue heat ramp shared by heat grids and their legends. */

/** A step on the heat ramp: 0 is empty, 4 is the busiest. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** Background classes of the ramp, empty to full (tokens in tokens.css). */
export const HEAT_CLASSES = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
] as const satisfies readonly string[];

/**
 * The ramp step of `value` against the largest value shown: 0 only for
 * nothing, so a single event never looks empty.
 */
export function heatLevel(value: number, max: number): HeatLevel {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as HeatLevel;
}
