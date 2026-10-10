import { droppedDate } from "../../core/calendar/dateDrop";
import { useDragItem } from "../../ui/dnd";
import type { CalendarItem } from "./types";
import type { CalendarActions } from "./useCalendarActions";

/** The drag type of calendar items (events and feed entries). */
export const CALENDAR_ITEM_TYPE = "calendar-item";

/**
 * Makes an event or feed entry draggable onto another calendar day. Projected
 * entries (a repeating todo's later dates) stay put.
 */
export function useItemDrag(surface: string, item: CalendarItem, actions: CalendarActions) {
  return useDragItem({
    id: `${surface}:${item.key}`,
    type: CALENDAR_ITEM_TYPE,
    disabled: item.kind === "entry" && item.entry.projected === true,
    onDragEnd: (info) => {
      const date = droppedDate(info);
      if (date === null) return;
      if (item.kind === "event") void actions.moveToDate(item, date);
      else actions.rescheduleEntry(item, date);
    },
  });
}
