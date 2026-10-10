import { useMemo } from "react";

import { useCalendarFeeds } from "../../core/calendar/feedContext";
import type { IsoDate } from "../../core/time";
import { useCalendarEvents } from "./queries";
import { entryItems, itemsByDay, type DayItems } from "./selectors";

/** Events and feed entries for each of `days` (consecutive, in order). */
export function useCalendarDays(
  days: readonly IsoDate[],
  timeZone: string,
): { byDay: Map<IsoDate, DayItems>; loading: boolean } {
  const first = days[0] ?? "";
  const last = days.at(-1) ?? first;
  const { events, loading } = useCalendarEvents(first, last);
  const feeds = useCalendarFeeds();
  const byDay = useMemo(
    () => itemsByDay(days, events, entryItems(feeds), timeZone),
    [days, events, feeds, timeZone],
  );
  return { byDay, loading };
}
