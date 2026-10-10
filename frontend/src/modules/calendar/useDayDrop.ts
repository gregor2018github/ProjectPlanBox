import { DATE_DROP_ACCEPTS, dateDropData } from "../../core/calendar/dateDrop";
import type { IsoDate } from "../../core/time";
import { useDropTarget } from "../../ui/dnd";

/**
 * Makes an element a calendar day that todos and calendar items can be
 * dropped on. `surface` keeps ids unique when the pane and the page both
 * show the same day.
 */
export function useDayDrop(surface: string, date: IsoDate) {
  return useDropTarget({
    id: `calendar-day:${surface}:${date}`,
    accept: [...DATE_DROP_ACCEPTS],
    data: { ...dateDropData(date) },
  });
}
