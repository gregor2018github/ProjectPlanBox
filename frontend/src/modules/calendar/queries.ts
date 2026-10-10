import { queryOptions, useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap, type ApiClient } from "../../core/api/client";
import type { IsoDate } from "../../core/time";
import { mergeRanges, monthRange, monthsCovering } from "./selectors";
import type { CalendarRange, EventItem } from "./types";

/** Query keys of the calendar module. Events are cached per calendar month. */
export const calendarKeys = {
  all: ["calendar"] as const,
  months: ["calendar", "month"] as const,
  month: (key: string) => ["calendar", "month", key] as const,
};

/** The events and occurrences of one month ("YYYY-MM"). */
export function monthQueryOptions(client: ApiClient, key: string) {
  const { start, end } = monthRange(key);
  return queryOptions({
    queryKey: calendarKeys.month(key),
    queryFn: () =>
      unwrap(client.GET("/api/calendar/events", { params: { query: { start, end } } })),
  });
}

interface Months {
  ranges: CalendarRange[];
  loading: boolean;
}

// Module-level so TanStack Query can keep the combined result stable between renders.
function combine(results: UseQueryResult<CalendarRange>[]): Months {
  return {
    ranges: results.flatMap((r) => (r.data === undefined ? [] : [r.data])),
    loading: results.some((r) => r.isPending),
  };
}

/** Subscribes to every month `[from, to]` touches and merges their occurrences. */
export function useCalendarEvents(
  from: IsoDate,
  to: IsoDate,
): { events: EventItem[]; loading: boolean } {
  const client = useApiClient();
  const keys = monthsCovering(from, to);
  const { ranges, loading } = useQueries({
    queries: keys.map((key) => monthQueryOptions(client, key)),
    combine,
  });
  const events = useMemo(() => mergeRanges(ranges), [ranges]);
  return { events, loading };
}
