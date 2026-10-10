import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

import type { IsoDate } from "../time";
import type { CalendarFeed, CalendarFeedRegistry, CalendarRange } from "./feed";

/** The app-wide calendar feed registry. */
export const CalendarFeedsContext = createContext<CalendarFeedRegistry | null>(null);

function useRegistry(): CalendarFeedRegistry {
  const registry = useContext(CalendarFeedsContext);
  if (registry === null) throw new Error("Calendar feeds need a CalendarFeedsContext provider");
  return registry;
}

/**
 * Publishes a feed while the caller is mounted. Memoise it (useMemo); a new
 * object republishes.
 */
export function useCalendarFeed(feed: CalendarFeed | null): void {
  const registry = useRegistry();
  useEffect(() => (feed === null ? undefined : registry.register(feed)), [registry, feed]);
}

/** Returns every published feed and re-renders when they change. */
export function useCalendarFeeds(): CalendarFeed[] {
  const registry = useRegistry();
  return useSyncExternalStore(registry.subscribe, registry.list);
}

/** Announces that the caller shows the dates `start`..`end` (inclusive) while mounted. */
export function useCalendarRange(start: IsoDate, end: IsoDate): void {
  const registry = useRegistry();
  useEffect(
    () => (start === "" ? undefined : registry.watch({ start, end })),
    [registry, start, end],
  );
}

/** Returns the ranges the calendar shows now and re-renders when they change. */
export function useCalendarRanges(): CalendarRange[] {
  const registry = useRegistry();
  return useSyncExternalStore(registry.subscribe, registry.listRanges);
}
