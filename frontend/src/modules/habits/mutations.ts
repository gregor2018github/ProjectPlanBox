/**
 * Optimistic mutations (ARCHITECTURE §8). Every mutation of this module runs
 * in one serial scope, edits the cached habit list immediately, rolls back
 * and shows a toast on error, and refetches afterwards, because only the
 * server expands schedules and counts streaks.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";
import type { IsoDate } from "../../core/time";
import { useToast } from "../../ui/useToast";
import {
  applyChecked,
  applyDelete,
  applyPatch,
  buildHabit,
  mergeRow,
  type CreateHabitVars,
} from "./apply";
import { habitKeys } from "./queries";
import type { Habit, HabitPatch, HabitRow } from "./types";

const SCOPE = { id: "habits" };

interface OptimisticConfig<TVars, TData> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** The optimistic change to every cached habit list. */
  edit: (habits: Habit[], vars: TVars) => Habit[];
  onSuccess?: (data: TData, vars: TVars) => void;
  errorTitle: string;
}

function useOptimisticMutation<TVars, TData>(config: OptimisticConfig<TVars, TData>) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: config.mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.all });
      const snapshot = queryClient.getQueriesData<Habit[]>({ queryKey: habitKeys.all });
      queryClient.setQueriesData<Habit[]>(
        { queryKey: habitKeys.all },
        (habits) => habits && config.edit(habits, vars),
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      show({ title: config.errorTitle, description: error.message, tone: "error" });
    },
    onSuccess: (data, vars) => {
      config.onSuccess?.(data, vars);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: habitKeys.all }),
  });
}

function useMergeRow() {
  const queryClient = useQueryClient();
  return (row: HabitRow) => {
    queryClient.setQueriesData<Habit[]>(
      { queryKey: habitKeys.all },
      (habits) => habits && mergeRow(habits, row),
    );
  };
}

const now = () => new Date().toISOString();

/** Creates a daily habit starting today. */
export function useCreateHabit() {
  const client = useApiClient();
  const merge = useMergeRow();
  return useOptimisticMutation<CreateHabitVars & { today: IsoDate }, HabitRow>({
    mutationFn: ({ id, name }) => unwrap(client.POST("/api/habits/habits", { body: { id, name } })),
    edit: (habits, vars) => [...habits, buildHabit(vars, vars.today, now())],
    onSuccess: merge,
    errorTitle: "Could not add the habit",
  });
}

/** Changes name, notes, schedule or start date. */
export function useUpdateHabit() {
  const client = useApiClient();
  const merge = useMergeRow();
  return useOptimisticMutation<{ id: string; patch: HabitPatch }, HabitRow>({
    mutationFn: ({ id, patch }) =>
      unwrap(
        client.PATCH("/api/habits/habits/{habit_id}", {
          params: { path: { habit_id: id } },
          body: patch,
        }),
      ),
    edit: (habits, { id, patch }) => applyPatch(habits, id, patch),
    onSuccess: merge,
    errorTitle: "Could not change the habit",
  });
}

/** Deletes a habit (restore undoes it). */
export function useDeleteHabit() {
  const client = useApiClient();
  return useOptimisticMutation<{ id: string }, unknown>({
    mutationFn: ({ id }) =>
      unwrap(
        client.DELETE("/api/habits/habits/{habit_id}", { params: { path: { habit_id: id } } }),
      ),
    edit: (habits, { id }) => applyDelete(habits, id),
    errorTitle: "Could not delete the habit",
  });
}

/** Brings a deleted habit back (it reappears with the refetch). */
export function useRestoreHabit() {
  const client = useApiClient();
  return useOptimisticMutation<{ id: string }, HabitRow>({
    mutationFn: ({ id }) =>
      unwrap(
        client.POST("/api/habits/habits/{habit_id}/restore", {
          params: { path: { habit_id: id } },
        }),
      ),
    edit: (habits) => habits,
    errorTitle: "Could not restore the habit",
  });
}

/** Variables of a check or uncheck. */
export interface SetCheckedVars {
  id: string;
  day: IsoDate;
  checked: boolean;
  today: IsoDate;
}

/** Checks or unchecks one day of a habit. */
export function useSetChecked() {
  const client = useApiClient();
  return useOptimisticMutation<SetCheckedVars, unknown>({
    mutationFn: ({ id, day, checked }) => {
      const params = { params: { path: { habit_id: id, day } } };
      return unwrap(
        checked
          ? client.PUT("/api/habits/habits/{habit_id}/checkins/{day}", params)
          : client.DELETE("/api/habits/habits/{habit_id}/checkins/{day}", params),
      );
    },
    edit: (habits, { id, day, checked, today }) => applyChecked(habits, id, day, checked, today),
    errorTitle: "Could not save the check-in",
  });
}
