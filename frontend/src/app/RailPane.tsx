import { AnimatePresence, motion } from "motion/react";

import type { ModuleManifest } from "../core/module";
import { panelTransition } from "../ui/motion";

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
  return (
    <AnimatePresence initial={false}>
      {module && rail && (
        <motion.aside
          key={module.id}
          aria-label={rail.label}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: `min(${WIDTH}px, 100vw)`, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={panelTransition}
          className="fixed inset-0 z-30 overflow-hidden bg-surface md:absolute md:inset-y-0 md:right-12 md:left-auto md:shadow-lg xl:static xl:shrink-0 xl:shadow-none"
        >
          <div className="flex h-full w-screen flex-col md:w-[360px]">
            <rail.Pane onClose={onClose} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
