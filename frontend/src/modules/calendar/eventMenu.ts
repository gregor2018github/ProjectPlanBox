import { Pencil, Trash2 } from "lucide-react";

import type { MenuEntry } from "../../ui/menuTypes";
import type { EventItem } from "./types";
import type { CalendarActions } from "./useCalendarActions";

/** The actions offered for an event (right-click, long-press, the agenda's ⋯ button). */
export function eventMenuEntries(item: EventItem, actions: CalendarActions): MenuEntry[] {
  return [
    {
      id: "edit",
      label: "Edit event",
      icon: Pencil,
      onSelect: () => {
        actions.open(item);
      },
    },
    { kind: "separator", id: "s1" },
    {
      id: "delete",
      label: item.event.rrule === null ? "Delete event" : "Delete…",
      icon: Trash2,
      danger: true,
      onSelect: () => {
        void actions.remove(item);
      },
    },
  ];
}
