import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";
import { newId } from "../ids";
import type { IsoDate } from "../time";

/** Query keys owned by the Insights overview. */
export const insightKeys = {
  all: ["core", "insights"] as const,
  activity: (start: IsoDate, end: IsoDate) => ["core", "insights", "activity", start, end] as const,
};

/** Cross-module activity per day plus app opens; waits until the range is known. */
export function useActivity(range: { start: IsoDate; end: IsoDate } | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: insightKeys.activity(range?.start ?? "", range?.end ?? ""),
    queryFn: () =>
      unwrap(
        client.GET("/api/insights/activity", {
          params: { query: range ?? { start: "", end: "" } },
        }),
      ),
    enabled: range !== null,
  });
}

/** One id per page load, so a re-run effect or a retry counts the open once. */
const PAGE_LOAD_ID = newId();

/**
 * Records that the app was opened (once per page load). Best effort: a
 * failure is not worth a toast, the overview just misses one open.
 */
export function useRecordAppOpen(): void {
  const client = useApiClient();
  useEffect(() => {
    unwrap(client.POST("/api/insights/opens", { body: { id: PAGE_LOAD_ID } })).catch(() => {
      // Ignored on purpose (see above).
    });
  }, [client]);
}
