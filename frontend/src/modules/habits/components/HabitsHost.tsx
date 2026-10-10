import { useNavigate } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { useMemo } from "react";

import { useCommands } from "../../../core/commands/commandsContext";
import type { Command } from "../../../core/commands/registry";
import { useLinkableSource } from "../../../core/links/linkablesContext";
import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { NameDialog } from "../../../ui/NameDialog";
import { isDueToday } from "../days";
import { newHabitDialog, useNewHabitOpen } from "../newHabitStore";
import { HABITS_PATH } from "../paths";
import { useHabitData } from "../queries";
import { HABIT_TYPE, habitRef } from "../types";
import { useHabitActions } from "../useHabitActions";

/**
 * Mounted once for the app's lifetime: the module's shortcut and palette
 * commands (including "check off" for today's habits), the "new habit"
 * dialog, and its habits as link targets.
 */
export function HabitsHost() {
  const { habits, today } = useHabitData();
  const actions = useHabitActions();
  const navigate = useNavigate();
  const creating = useNewHabitOpen();

  const linkables = useMemo(
    () => ({
      entityType: HABIT_TYPE,
      noun: "Habit",
      icon: Flame,
      items: habits.map((h) => ({ ref: habitRef(h.id), title: h.name, hint: "Habit" })),
    }),
    [habits],
  );
  useLinkableSource(linkables);

  const goToHabits = () => {
    void navigate({ to: HABITS_PATH });
  };
  useShortcut({
    id: "habits.go",
    keys: "G B",
    description: "Go to Habits",
    group: "Navigation",
    run: goToHabits,
  });

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "habits.new",
        title: "New habit",
        group: "Habits",
        keywords: ["add", "create", "routine"],
        run: newHabitDialog.open,
      },
      {
        id: "habits.go",
        title: "Go to Habits",
        group: "Navigation",
        keywords: ["streaks", "routines"],
        shortcut: "G B",
        run: goToHabits,
      },
      ...(today === null
        ? []
        : habits
            .filter((h) => isDueToday(h, today))
            .map((h) => ({
              id: `habits.check.${h.id}`,
              title: `Check off habit: ${h.name}`,
              group: "Habits",
              keywords: ["done", "today"],
              run: () => {
                actions.toggle(h, today);
              },
            }))),
    ],
    // goToHabits reads navigate through its closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, today, actions, navigate],
  );
  useCommands(commands);

  return (
    <NameDialog
      open={creating}
      onOpenChange={(open) => {
        if (open) newHabitDialog.open();
        else newHabitDialog.close();
      }}
      title="New habit"
      submitLabel="Add habit"
      onSubmit={(name) => {
        const id = actions.create(name);
        if (id !== null) {
          void navigate({
            to: HABITS_PATH,
            search: { item: habitRef(id) },
          });
        }
      }}
    />
  );
}
