import { useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { formatDayLong } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { PageHeader } from "../../../ui/PageHeader";
import { ViewLayout } from "../../../ui/ViewLayout";
import { HabitRow } from "../components/HabitRow";
import { newHabitDialog } from "../newHabitStore";
import { useHabitData } from "../queries";
import { habitRef } from "../types";
import { useHabitActions } from "../useHabitActions";

/** Every habit with its streak and the last seven days to check off. */
export function HabitsPage() {
  const { habits, today, loading } = useHabitData();
  const actions = useHabitActions();
  const search: Record<string, unknown> = useSearch({ strict: false });
  const openItem = typeof search.item === "string" ? search.item : undefined;

  return (
    <ViewLayout>
      <PageHeader
        title="Habits"
        subtitle={today === null ? undefined : formatDayLong(today)}
        actions={
          <Button size="sm" onClick={newHabitDialog.open}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            New habit
          </Button>
        }
      />
      {today !== null && habits.length > 0 && (
        <ul aria-label="Habits" className="flex flex-col gap-1">
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              today={today}
              selected={openItem === habitRef(habit.id)}
              actions={actions}
            />
          ))}
        </ul>
      )}
      {!loading && habits.length === 0 && (
        <p className="px-3 py-6 text-base text-text-muted">
          No habits yet. Add one, then check it off each day to build a streak.
        </p>
      )}
    </ViewLayout>
  );
}
