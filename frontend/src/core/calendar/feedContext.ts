import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

import type { CalendarFeed, CalendarFeedRegistry } from "./feed";

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
