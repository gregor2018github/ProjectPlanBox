import { useMemo } from "react";

import { useCommands } from "../core/commands/commandsContext";
import type { RailItem } from "../core/module";
import { useShortcut } from "../core/shortcuts/useShortcut";

/** Props for {@link RailItemHost}. */
export interface RailItemHostProps {
  id: string;
  item: RailItem;
  onToggle: (id: string) => void;
}

/** Registers a rail item's toggle shortcut and palette command; renders nothing. */
export function RailItemHost({ id, item, onToggle }: RailItemHostProps) {
  const title = `Toggle ${item.label.toLowerCase()} panel`;
  useShortcut(
    item.shortcut === undefined
      ? null
      : {
          id: `shell.rail.${id}`,
          keys: item.shortcut,
          description: title,
          group: "General",
          run: () => {
            onToggle(id);
          },
        },
  );
  const commands = useMemo(
    () => [
      {
        id: `shell.rail.${id}`,
        title,
        group: "General",
        keywords: ["panel", "side", item.label.toLowerCase()],
        ...(item.shortcut !== undefined && { shortcut: item.shortcut }),
        run: () => {
          onToggle(id);
        },
      },
    ],
    [id, title, item, onToggle],
  );
  useCommands(commands);
  return null;
}
