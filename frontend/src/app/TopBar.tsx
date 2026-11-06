import { Menu, PanelLeftOpen } from "lucide-react";

import { SyncButton } from "../core/data/SyncButton";
import type { ModuleManifest } from "../core/module";
import { IconButton } from "../ui/IconButton";
import { useModules } from "./modulesContext";

/** Props for {@link TopBar}. */
export interface TopBarProps {
  onToggleSidebar: () => void;
  isDesktop: boolean;
  /** Rail items shown on the right (on small screens, where there is no rail). */
  railModules: readonly ModuleManifest[];
  railOpen: string | null;
  onToggleRail: (id: string) => void;
}

/** Thin bar above the content, shown when the sidebar is hidden. */
export function TopBar({
  onToggleSidebar,
  isDesktop,
  railModules,
  railOpen,
  onToggleRail,
}: TopBarProps) {
  // On the desktop the rail has the actions; on small screens they live here.
  const modules = useModules();
  const actionModules = isDesktop ? [] : modules;
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-3">
      <IconButton
        label={isDesktop ? "Expand sidebar" : "Open navigation"}
        icon={isDesktop ? PanelLeftOpen : Menu}
        shortcut="["
        onClick={onToggleSidebar}
      />
      <div className="flex items-center gap-1">
        {!isDesktop && <SyncButton />}
        {actionModules.map(
          (module) =>
            module.railAction && (
              <IconButton
                key={`${module.id}.action`}
                label={module.railAction.label}
                icon={module.railAction.icon}
                shortcut={module.railAction.shortcut}
                onClick={module.railAction.run}
              />
            ),
        )}
        {railModules.map(
          (module) =>
            module.rail && (
              <IconButton
                key={module.id}
                label={module.rail.label}
                icon={module.rail.icon}
                shortcut={module.rail.shortcut}
                pressed={railOpen === module.id}
                onClick={() => {
                  onToggleRail(module.id);
                }}
              />
            ),
        )}
      </div>
    </div>
  );
}
