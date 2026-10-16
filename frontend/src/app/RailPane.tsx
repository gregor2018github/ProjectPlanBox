import { AnimatePresence, motion } from "motion/react";

import type { ModuleManifest } from "../core/module";
import { DESKTOP_QUERY, useMediaQuery } from "../core/useMediaQuery";
import { cx } from "../ui/cx";
import { panelTransition } from "../ui/motion";
import { panelMotion, PHONE_PANEL_CLASS } from "./panelMotion";

/** Props for {@link RailPane}. */
export interface RailPaneProps {
  /** The module whose pane is open, if any. */
  module: ModuleManifest | undefined;
  onClose: () => void;
}

const WIDTH = 360;

/**
 * The side pane a rail icon opens. It sits beside the content from 1280 px,
 * floats over it between 768 and 1280 px, and fills the screen below that.
 */
export function RailPane({ module, onClose }: RailPaneProps) {
  const rail = module?.rail;
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return (
    <AnimatePresence initial={false}>
      {module && rail && (
        <motion.aside
          key={module.id}
          aria-label={rail.label}
          {...panelMotion(desktop, WIDTH)}
          transition={panelTransition}
          className={cx(
            PHONE_PANEL_CLASS,
            "overflow-clip bg-surface md:absolute md:inset-y-0 md:right-12 md:left-auto md:shadow-lg xl:static xl:shrink-0 xl:shadow-none",
          )}
        >
          <div className="flex h-full w-full flex-col md:w-[360px]">
            <rail.Pane onClose={onClose} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
