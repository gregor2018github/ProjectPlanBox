import { Copy, ExternalLink, PanelRightOpen, Trash2 } from "lucide-react";

import type { MenuEntry } from "../../ui/menuTypes";
import { isWebUrl } from "./selectors";
import type { Entry } from "./types";
import type { KnowledgeActions } from "./useKnowledgeActions";

/** The actions of an entry's ⋯ and context menus. */
export function entryMenuEntries(entry: Entry, actions: KnowledgeActions): MenuEntry[] {
  const entries: MenuEntry[] = [
    {
      id: "open",
      label: "Open details",
      icon: PanelRightOpen,
      shortcut: "Enter",
      onSelect: () => {
        actions.open(entry);
      },
    },
  ];
  if (entry.kind === "link" && isWebUrl(entry.url)) {
    const url = entry.url;
    entries.push(
      {
        id: "visit",
        label: "Open link",
        icon: ExternalLink,
        onSelect: () => {
          window.open(url, "_blank", "noopener,noreferrer");
        },
      },
      {
        id: "copy",
        label: "Copy address",
        icon: Copy,
        onSelect: () => {
          actions.copy(url, "Address copied");
        },
      },
    );
  }
  if (entry.kind === "snippet") {
    entries.push({
      id: "copy",
      label: "Copy code",
      icon: Copy,
      onSelect: () => {
        actions.copy(entry.body, "Code copied");
      },
    });
  }
  entries.push(
    { kind: "separator", id: "sep" },
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      shortcut: "Delete",
      onSelect: () => {
        actions.remove(entry);
      },
    },
  );
  return entries;
}
