import type { ModuleManifest } from "../core/module";
import { IconButton } from "../ui/IconButton";

/** Props for {@link RightRail}. */
export interface RightRailProps {
  /** Modules that have a rail item. */
  modules: readonly ModuleManifest[];
  openId: string | null;
  onToggle: (id: string) => void;
}

/** The slim icon bar on the right edge; each icon toggles its module's pane. */
export function RightRail({ modules, openId, onToggle }: RightRailProps) {
  return (
    <nav
      aria-label="Panels"
      className="flex w-12 shrink-0 flex-col items-center gap-1 bg-sidebar py-2"
    >
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
