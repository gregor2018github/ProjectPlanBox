import { Menu, PanelLeftOpen } from "lucide-react";

import { IconButton } from "../ui/IconButton";

/** Props for {@link TopBar}. */
export interface TopBarProps {
  onToggleSidebar: () => void;
  isDesktop: boolean;
}

/** Thin bar above the content, shown when the sidebar is hidden. */
export function TopBar({ onToggleSidebar, isDesktop }: TopBarProps) {
  return (
    <div className="flex h-12 shrink-0 items-center px-3">
      <IconButton
        label={isDesktop ? "Expand sidebar" : "Open navigation"}
        icon={isDesktop ? PanelLeftOpen : Menu}
        shortcut="["
        onClick={onToggleSidebar}
      />
    </div>
  );
}
