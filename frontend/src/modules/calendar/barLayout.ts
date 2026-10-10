/** Geometry of multi-day bars laid over a row of day cells. */
import type { CSSProperties } from "react";

import type { SpanBar } from "./selectors";

/** One lane of bars: a 24 px chip plus the 2 px gap between chips (`h-6`, `gap-0.5`). */
export const LANE_HEIGHT = 26;

/** How many lanes of bars a month week shows; the rest count as "+N more" in the cells. */
export const MAX_BAR_LANES = 3;

/** Px from the top of a month cell to its first bar lane: padding, the date button and a gap. */
export const MONTH_CELL_HEADER = 30;

/** Px from the top of an all-day cell to its first bar lane (its padding). */
export const ALL_DAY_CELL_HEADER = 2;

/** Where a bar sits over `columns` equal day cells, `top` px below the row's top. */
export function barStyle(bar: SpanBar, columns: number, top: number): CSSProperties {
  return {
    top: top + bar.lane * LANE_HEIGHT,
    left: `${String((bar.from / columns) * 100)}%`,
    width: `${String(((bar.to - bar.from + 1) / columns) * 100)}%`,
  };
}

/** The height a day cell reserves under its header so its own chips start below `lanes` bars. */
export function reservedHeight(lanes: number): number {
  // The cell's flex gap follows the spacer, so it is one gap short of the lanes.
  return lanes > 0 ? lanes * LANE_HEIGHT - 2 : 0;
}
