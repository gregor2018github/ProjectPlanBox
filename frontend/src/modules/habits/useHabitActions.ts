/**
 * What the user can do to habits, in their words: each action applies the
 * optimistic mutation and records how to undo it (a toast for deletes,
 * Ctrl+Z for everything).
 */
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { confirmDelete } from "../../core/confirm/confirmDelete";
import { newId } from "../../core/ids";
import type { IsoDate } from "../../core/time";
import { useToday } from "../../core/useToday";
import { useUndo } from "../../core/undo/undoContext";
import {
  useCreateHabit,
  useDeleteHabit,
  useRestoreHabit,
  useSetChecked,
  useSetDaysOff,
  useUpdateHabit,
} from "./mutations";
import { habitRef, type Habit, type HabitDay, type HabitPatch } from "./types";

/** Returns the habit actions bound to the current caches. */
export function useHabitActions() {
  const navigate = useNavigate();
  const pushUndo = useUndo();
  const today = useToday();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const restoreHabit = useRestoreHabit();
  const setChecked = useSetChecked();
  const setDaysOff = useSetDaysOff();

  return useMemo(
    () => ({
      /** Creates a daily habit; returns its id immediately (optimistic), or null before today is known. */
      create(name: string): string | null {
        if (today === null) return null;
        const id = newId();
        createHabit.mutate({ id, name: name.trim(), today });
        return id;
      },

      update(id: string, patch: HabitPatch): void {
        updateHabit.mutate({ id, patch });
      },

      /** Checks or unchecks a day (not in the future). */
      toggle(habit: Habit, day: IsoDate): void {
        if (today === null || day > today) return;
        const checked = !habit.checkins.includes(day);
        setChecked.mutate({ id: habit.id, day, checked, today });
        pushUndo({
          label: checked ? `Checked off “${habit.name}”` : `Unchecked “${habit.name}”`,
          silent: true,
          undo: () => {
            setChecked.mutate({ id: habit.id, day, checked: !checked, today });
          },
        });
      },

      /**
       * Takes days off (or back); undo reverts exactly the days that changed.
       * `label` names the change for the undo toast.
       */
      setDaysOff(items: HabitDay[], off: boolean, label: string): void {
        if (today === null || items.length === 0) return;
        void setDaysOff.mutateAsync({ items, off, today }).then(
          (changed) => {
            if (changed.items.length === 0) return;
            pushUndo({
              label,
              silent: items.length === 1,
              undo: () => {
                setDaysOff.mutate({ items: changed.items, off: !off, today });
              },
            });
          },
          () => {
            // The mutation already rolled back and showed the error.
          },
        );
      },

      remove(habit: Habit): void {
        confirmDelete(
          {
            title: "Delete habit?",
            description: `“${habit.name}” and its check-ins will be deleted.`,
          },
          () => {
            deleteHabit.mutate({ id: habit.id });
            pushUndo({
              label: `Deleted habit “${habit.name}”`,
              undo: () => {
                restoreHabit.mutate({ id: habit.id });
              },
            });
          },
        );
      },

      /** Opens a habit in the detail panel. */
      open(habit: Habit): void {
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, item: habitRef(habit.id) }),
        });
      },
    }),
    [
      navigate,
      pushUndo,
      today,
      createHabit,
      updateHabit,
      deleteHabit,
      restoreHabit,
      setChecked,
      setDaysOff,
    ],
  );
}

/** The bound actions object. */
export type HabitActions = ReturnType<typeof useHabitActions>;
