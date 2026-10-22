import { FileText, PanelRightOpen, Trash2 } from "lucide-react";

import type { MenuEntry } from "../../ui/menuTypes";
import type { Entry } from "./types";
import type { KnowledgeActions } from "./useKnowledgeActions";

/** The actions of a page's ⋯ and context menus. */
export function entryMenuEntries(entry: Entry, actions: KnowledgeActions): MenuEntry[] {
  return [
    {
      id: "open",
      label: "Open page",
      icon: FileText,
      shortcut: "Enter",
      onSelect: () => {
        actions.open(entry);
      },
    },
    {
      id: "details",
      label: "Details",
      icon: PanelRightOpen,
      onSelect: () => {
        actions.openDetails(entry);
      },
    },
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
  ];
}
