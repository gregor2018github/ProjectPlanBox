import type { TargetAndTransition } from "motion/react";

/** Classes that make a side panel cover the whole screen below `md`, clear of the system bars. */
export const PHONE_PANEL_CLASS =
  "fixed inset-0 z-30 pt-(--safe-top) pr-(--safe-right) pb-(--safe-bottom) pl-(--safe-left) md:p-0";

/**
 * How a side panel (details, rail pane) enters and leaves. From `md` it
 * grows to `width` beside or over the content; on a phone it covers the
 * whole screen and slides in from the right.
 */
export function panelMotion(
  desktop: boolean,
  width: number,
): { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } {
  return desktop
    ? {
        initial: { width: 0, opacity: 0 },
        animate: { width, opacity: 1 },
        exit: { width: 0, opacity: 0 },
      }
    : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } };
}
