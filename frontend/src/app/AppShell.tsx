import { Outlet, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { useMeta } from "../core/api/coreQueries";
import { CommandPalette } from "../core/commands/CommandPalette";
import { ShortcutsDialog } from "../core/shortcuts/ShortcutsDialog";
import { DESKTOP_QUERY, PANE_INLINE_QUERY, useMediaQuery } from "../core/useMediaQuery";
import { DndRoot } from "../ui/DndRoot";
import { Sheet } from "../ui/Sheet";
import { Toaster } from "../ui/Toaster";
import { DetailPanel } from "./DetailPanel";
import { isBackgroundClick } from "./isBackgroundClick";
import { useModules } from "./modulesContext";
import { RailItemHost } from "./RailItemHost";
import { RailPane } from "./RailPane";
import { RightRail } from "./RightRail";
import { ShutdownDialog } from "./ShutdownDialog";
import { Sidebar } from "./Sidebar";
import { SidebarContent } from "./SidebarContent";
import { StoppedScreen } from "./StoppedScreen";
import { TopBar } from "./TopBar";
import { useShellCommands } from "./useShellCommands";
import { useRailPane } from "./useRailPane";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

/**
 * The root layout: sidebar | main | optional detail panel | optional rail
 * pane | icon rail, plus the global hosts (palette, shortcut overview,
 * toasts) and every module's Host. After a shutdown it is replaced by the
 * stopped screen.
 */
export function AppShell() {
  const modules = useModules();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [railOpen, toggleRail, closeRail] = useRailPane();
  const railModules = modules.filter((m) => m.rail !== undefined);
  const openPane = railModules.find((m) => m.id === railOpen);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Close the navigation sheet once the user has navigated somewhere.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [navPath, setNavPath] = useState(pathname);
  if (pathname !== navPath) {
    setNavPath(pathname);
    setMobileNavOpen(false);
  }
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [stopped, setStopped] = useState(false);
  const { data: meta } = useMeta();
  const canShutdown = meta?.can_shutdown === true;
  // Module routes are assembled at runtime, so the router cannot type search params here.
  const search: unknown = useSearch({ strict: false });
  const item = itemOf(search);
  const navigate = useNavigate();
  // Below 1280 px the rail pane floats over the detail panel, so opening an
  // item (from the pane or anywhere else) closes the pane to show it.
  const paneInline = useMediaQuery(PANE_INLINE_QUERY);
  const [shownItem, setShownItem] = useState(item);
  if (item !== shownItem) {
    setShownItem(item);
    if (item !== undefined && !paneInline && railOpen !== null) closeRail();
  }

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

  const requestShutdown = useCallback(() => {
    setMobileNavOpen(false);
    setShutdownOpen(true);
  }, []);
  const stop = useCallback(() => {
    setStopped(true);
  }, []);

  useShellCommands({
    togglePalette,
    toggleSidebar,
    showShortcuts,
    closeDetail: item === undefined ? null : closeDetail,
    requestShutdown: canShutdown ? requestShutdown : null,
  });

  if (stopped) return <StoppedScreen />;

  const showTopBar = !isDesktop || collapsed;
  const onRequestShutdown = canShutdown ? requestShutdown : undefined;

  return (
    <DndRoot>
      <div className="relative flex h-full overflow-hidden bg-bg">
        {isDesktop ? (
          <Sidebar
            collapsed={collapsed}
            onCollapse={toggleCollapsed}
            onOpenPalette={openPalette}
            onRequestShutdown={onRequestShutdown}
          />
        ) : (
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen} title="Navigation">
            <SidebarContent
              onOpenPalette={openPalette}
              onClose={() => {
                setMobileNavOpen(false);
              }}
              closeLabel="Close navigation"
              onRequestShutdown={onRequestShutdown}
            />
          </Sheet>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          {showTopBar && (
            <TopBar
              onToggleSidebar={toggleSidebar}
              isDesktop={isDesktop}
              railModules={isDesktop ? [] : railModules}
              railOpen={railOpen}
              onToggleRail={toggleRail}
            />
          )}
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            onClick={(event) => {
              // Clicking empty space in the view dismisses the detail panel.
              if (item !== undefined && isBackgroundClick(event.target, event.currentTarget)) {
                closeDetail();
              }
            }}
          >
            <Outlet />
          </div>
        </main>
        <DetailPanel item={item} onClose={closeDetail} />
        <RailPane module={openPane} onClose={closeRail} />
        {isDesktop && railModules.length > 0 && (
          <RightRail modules={railModules} openId={railOpen} onToggle={toggleRail} />
        )}

        {modules.map((module) => module.Host && <module.Host key={module.id} />)}
        {railModules.map(
          (module) =>
            module.rail && (
              <RailItemHost
                key={module.id}
                id={module.id}
                item={module.rail}
                onToggle={toggleRail}
              />
            ),
        )}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <ShutdownDialog open={shutdownOpen} onOpenChange={setShutdownOpen} onStopped={stop} />
        <Toaster />
      </div>
    </DndRoot>
  );
}

function itemOf(search: unknown): string | undefined {
  if (typeof search !== "object" || search === null || !("item" in search)) return undefined;
  return typeof search.item === "string" ? search.item : undefined;
}
