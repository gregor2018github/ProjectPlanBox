import { motion } from "motion/react";

import { panelTransition } from "../ui/motion";
import { SidebarContent } from "./SidebarContent";

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
  onOpenPalette: () => void;
  /** Present when the server can be shut down from the app. */
  onRequestShutdown?: (() => void) | undefined;
}

const WIDTH = 256;

/** The desktop sidebar; collapses to zero width and becomes inert. */
export function Sidebar({ collapsed, onCollapse, onOpenPalette, onRequestShutdown }: SidebarProps) {
  return (
    <motion.aside
      aria-label="Sidebar"
      initial={false}
      animate={{ width: collapsed ? 0 : WIDTH }}
      transition={panelTransition}
      inert={collapsed}
      className="shrink-0 overflow-hidden bg-sidebar"
    >
      <div className="flex h-full flex-col" style={{ width: WIDTH }}>
        <SidebarContent
          onOpenPalette={onOpenPalette}
          onClose={onCollapse}
          closeLabel="Collapse sidebar"
          closeShortcut="["
          onRequestShutdown={onRequestShutdown}
        />
      </div>
    </motion.aside>
  );
}
