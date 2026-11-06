import { SyncButton } from "../core/data/SyncButton";
import { useCloudConnected } from "../core/data/useCloudRun";
import { IconButton } from "../ui/IconButton";
import { useModules } from "./modulesContext";

/** Props for {@link RightRail}. */
export interface RightRailProps {
  openId: string | null;
  onToggle: (id: string) => void;
}

/**
 * The slim icon bar on the right edge: the Google Drive quick sync (only
 * when this device is connected), the modules' one-click actions, then an
 * icon per module that toggles its pane. Renders nothing when it would be
 * empty.
 */
export function RightRail({ openId, onToggle }: RightRailProps) {
  const modules = useModules();
  const connected = useCloudConnected();
  const hasModuleIcons = modules.some((m) => m.rail !== undefined || m.railAction !== undefined);
  if (!connected && !hasModuleIcons) return null;
  return (
    <nav
      aria-label="Panels"
      className="flex w-12 shrink-0 flex-col items-center gap-1 bg-sidebar py-2"
    >
      <SyncButton tooltipSide="left" />
      {modules.map(
        (module) =>
          module.railAction && (
            <IconButton
              key={`${module.id}.action`}
              label={module.railAction.label}
              icon={module.railAction.icon}
              shortcut={module.railAction.shortcut}
              tooltipSide="left"
              onClick={module.railAction.run}
            />
          ),
      )}
      {modules.map(
        (module) =>
          module.rail && (
            <IconButton
              key={module.id}
              label={module.rail.label}
              icon={module.rail.icon}
              shortcut={module.rail.shortcut}
              tooltipSide="left"
              pressed={openId === module.id}
              onClick={() => {
                onToggle(module.id);
              }}
            />
          ),
      )}
    </nav>
  );
}
