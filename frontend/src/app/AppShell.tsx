import { Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { CommandPalette } from "../core/commands/CommandPalette";
import { ShortcutsDialog } from "../core/shortcuts/ShortcutsDialog";
import { DESKTOP_QUERY, useMediaQuery } from "../core/useMediaQuery";
import { Sheet } from "../ui/Sheet";
import { Toaster } from "../ui/Toaster";
import { DetailPanel } from "./DetailPanel";
import { useModules } from "./modulesContext";
import { Sidebar } from "./Sidebar";
import { SidebarContent } from "./SidebarContent";
import { TopBar } from "./TopBar";
import { useShellCommands } from "./useShellCommands";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

/**
 * The root layout: sidebar | main | optional detail panel, plus the global
 * hosts (palette, shortcut overview, toasts) and every module's Host.
 */
export function AppShell() {
  const modules = useModules();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Module routes are assembled at runtime, so the router cannot type search params here.
  const search: unknown = useSearch({ strict: false });
  const item = itemOf(search);
  const navigate = useNavigate();

  const toggleSidebar = useCallback(() => {
    if (isDesktop) toggleCollapsed();
    else setMobileNavOpen((open) => !open);
  }, [isDesktop, toggleCollapsed]);
  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => !open);
  }, []);
  const openPalette = useCallback(() => {
    setMobileNavOpen(false);
    setPaletteOpen(true);
  }, []);
  const showShortcuts = useCallback(() => {
    setShortcutsOpen(true);
  }, []);
  const closeDetail = useCallback(() => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, item: undefined }),
    });
  }, [navigate]);

  useShellCommands({
    togglePalette,
    toggleSidebar,
    showShortcuts,
    closeDetail: item === undefined ? null : closeDetail,
  });

  const showTopBar = !isDesktop || collapsed;

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      {isDesktop ? (
        <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} onOpenPalette={openPalette} />
      ) : (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen} title="Navigation">
          <SidebarContent
            onOpenPalette={openPalette}
            onClose={() => {
              setMobileNavOpen(false);
            }}
            closeLabel="Close navigation"
          />
        </Sheet>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        {showTopBar && <TopBar onToggleSidebar={toggleSidebar} isDesktop={isDesktop} />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      <DetailPanel item={item} onClose={closeDetail} />

      {modules.map((module) => module.Host && <module.Host key={module.id} />)}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Toaster />
    </div>
  );
}

function itemOf(search: unknown): string | undefined {
  if (typeof search !== "object" || search === null || !("item" in search)) return undefined;
  return typeof search.item === "string" ? search.item : undefined;
}
