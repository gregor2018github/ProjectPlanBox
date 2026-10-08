import { Link } from "@tanstack/react-router";
import { House, PanelLeftClose, Search } from "lucide-react";

import { IconButton } from "../ui/IconButton";
import { Kbd } from "../ui/Kbd";
import { ConnectionStatus } from "./ConnectionStatus";
import { useModules } from "./modulesContext";
import { ThemeSwitch } from "./ThemeSwitch";

/** Props for {@link SidebarContent}. */
export interface SidebarContentProps {
  onOpenPalette: () => void;
  /** Collapses (desktop) or closes (mobile sheet) the sidebar. */
  onClose: () => void;
  closeLabel: string;
  closeShortcut?: string;
}

/** Sidebar body shared by the desktop sidebar and the mobile sheet. */
export function SidebarContent({
  onOpenPalette,
  onClose,
  closeLabel,
  closeShortcut,
}: SidebarContentProps) {
  const modules = useModules();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between pl-2">
        <span className="text-base font-semibold tracking-tight">PlanBox</span>
        <IconButton
          label={closeLabel}
          icon={PanelLeftClose}
          shortcut={closeShortcut}
          onClick={onClose}
        />
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2 text-sm text-text-muted transition-colors duration-(--duration-fast) ease-out hover:border-border-strong coarse:h-11"
      >
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <span className="flex-1 text-left">Search or run…</span>
        <Kbd keys="Ctrl+K" />
      </button>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-base text-text transition-colors duration-(--duration-fast) ease-out hover:bg-hover data-[status=active]:bg-selected data-[status=active]:font-medium coarse:h-11"
        >
          <House size={16} strokeWidth={1.75} aria-hidden className="text-text-muted" />
          Home
        </Link>
        {modules.map(
          (module) => module.SidebarSection && <module.SidebarSection key={module.id} />,
        )}
      </nav>

      <div className="flex items-center justify-between gap-2 pl-2">
        <ConnectionStatus />
        <ThemeSwitch />
      </div>
    </div>
  );
}
