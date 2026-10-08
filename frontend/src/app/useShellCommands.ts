import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { useCommands } from "../core/commands/commandsContext";
import type { Command } from "../core/commands/registry";
import { useShortcut } from "../core/shortcuts/useShortcut";
import { useTheme } from "../core/theme/useTheme";

/** The shell actions that commands and shortcuts trigger. */
export interface ShellActions {
  togglePalette: () => void;
  toggleSidebar: () => void;
  showShortcuts: () => void;
  /** Present only while the detail panel is open. */
  closeDetail: (() => void) | null;
}

/** Registers the shell's own commands and shortcuts. */
export function useShellCommands(actions: ShellActions): void {
  const { togglePalette, toggleSidebar, showShortcuts, closeDetail } = actions;
  const { setPreference } = useTheme();
  const navigate = useNavigate();

  useShortcut({
    id: "shell.palette",
    keys: "Ctrl+K",
    description: "Open command palette",
    group: "General",
    allowInInput: true,
    run: togglePalette,
  });
  useShortcut({
    id: "shell.sidebar",
    keys: "[",
    description: "Toggle sidebar",
    group: "General",
    run: toggleSidebar,
  });
  useShortcut({
    id: "shell.shortcuts",
    keys: "?",
    description: "Show keyboard shortcuts",
    group: "General",
    run: showShortcuts,
  });
  useShortcut({
    id: "shell.home",
    keys: "G H",
    description: "Go to Home",
    group: "Navigation",
    run: () => void navigate({ to: "/" }),
  });
  useShortcut(
    closeDetail
      ? {
          id: "shell.detail",
          keys: "]",
          description: "Close detail panel",
          group: "General",
          run: closeDetail,
        }
      : null,
  );

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "shell.sidebar",
        title: "Toggle sidebar",
        group: "General",
        shortcut: "[",
        run: toggleSidebar,
      },
      {
        id: "shell.shortcuts",
        title: "Show keyboard shortcuts",
        group: "General",
        keywords: ["keys", "help", "hotkeys"],
        shortcut: "?",
        run: showShortcuts,
      },
      {
        id: "shell.home",
        title: "Go to Home",
        group: "Navigation",
        shortcut: "G H",
        run: () => void navigate({ to: "/" }),
      },
      {
        id: "theme.system",
        title: "Theme: match system",
        group: "Theme",
        keywords: ["auto", "appearance"],
        run: () => {
          setPreference("system");
        },
      },
      {
        id: "theme.light",
        title: "Theme: light",
        group: "Theme",
        keywords: ["day", "appearance"],
        run: () => {
          setPreference("light");
        },
      },
      {
        id: "theme.dark",
        title: "Theme: dark",
        group: "Theme",
        keywords: ["night", "appearance"],
        run: () => {
          setPreference("dark");
        },
      },
    ],
    [toggleSidebar, showShortcuts, navigate, setPreference],
  );
  useCommands(commands);
}
