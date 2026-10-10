/**
 * Optimistic mutations (ARCHITECTURE §8). Every calendar mutation runs in one
 * serial scope and patches all cached months at once with the `apply`
 * function its caller passes, rolls back and shows a toast on error, and
 * refetches the months when it settles: only the server expands recurrence,
 * so its answer replaces the guess. Wording and undo live in
 * `useCalendarActions`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";
import type { IsoDate } from "../../core/time";
import { useToast } from "../../ui/useToast";
import { calendarKeys } from "./queries";
import type { CalendarRange, EventCreateVars, EventPatchVars, Scope } from "./types";

const SCOPE = { id: "calendar" };

/** How a mutation changes a cached month before the server answers. */
export type MonthPatch = (range: CalendarRange) => CalendarRange;

function useCalendarMutation<TVars extends { apply?: MonthPatch }, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  errorTitle: string,
) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.all });
      const snapshot = queryClient.getQueriesData<CalendarRange>({ queryKey: calendarKeys.months });
      const { apply } = vars;
      if (apply) {
        queryClient.setQueriesData<CalendarRange>({ queryKey: calendarKeys.months }, (range) =>
          range === undefined ? range : apply(range),
        );
      }
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      show({ title: errorTitle, description: error.message, tone: "error" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

/** Creates an event or series. */
export function useCreateEvent() {
  const client = useApiClient();
  return useCalendarMutation(
    ({ body }: { body: EventCreateVars & { id: string }; apply?: MonthPatch }) =>
      unwrap(client.POST("/api/calendar/events", { body })),
    "Could not add the event",
  );
}

/** Changes an event, or this / following / all occurrences of a series. */
export function useUpdateEvent() {
  const client = useApiClient();
  return useCalendarMutation(
    ({ id, body }: { id: string; body: EventPatchVars; apply?: MonthPatch }) =>
      unwrap(
        client.PATCH("/api/calendar/events/{event_id}", {
          params: { path: { event_id: id } },
          body,
        }),
      ),
    "Could not save the event",
  );
}

/** Deletes an event, or this / following / all occurrences of a series. */
export function useDeleteEvent() {
  const client = useApiClient();
  return useCalendarMutation(
    ({
      id,
      scope,
      occurrenceDate,
    }: {
      id: string;
      scope: Scope;
      occurrenceDate: IsoDate | null;
      apply?: MonthPatch;
    }) =>
      unwrap(
        client.DELETE("/api/calendar/events/{event_id}", {
          params: {
            path: { event_id: id },
            query: { scope, ...(occurrenceDate !== null && { occurrence_date: occurrenceDate }) },
          },
        }),
      ),
    "Could not delete the event",
  );
}

/** Undoes deleting a whole event or series. */
export function useRestoreEvent() {
  const client = useApiClient();
  return useCalendarMutation(
    ({ id }: { id: string; apply?: MonthPatch }) =>
      unwrap(
        client.POST("/api/calendar/events/{event_id}/restore", {
          params: { path: { event_id: id } },
        }),
      ),
    "Could not restore the event",
  );
}

/** Brings back one deleted occurrence of a series. */
export function useRestoreOccurrence() {
  const client = useApiClient();
  return useCalendarMutation(
    ({ id, date }: { id: string; date: IsoDate; apply?: MonthPatch }) =>
      unwrap(
        client.POST("/api/calendar/events/{event_id}/occurrences/{occurrence_date}/restore", {
          params: { path: { event_id: id, occurrence_date: date } },
        }),
      ),
    "Could not restore the event",
  );
}
