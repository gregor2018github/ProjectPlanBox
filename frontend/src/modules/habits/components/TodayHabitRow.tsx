import type { IsoDate } from "../../../core/time";
import { Checkbox } from "../../../ui/Checkbox";
import type { Habit } from "../types";
import type { HabitActions } from "../useHabitActions";
import { StreakBadge } from "./StreakBadge";

/** Props for {@link TodayHabitRow}. */
export interface TodayHabitRowProps {
  habit: Habit;
  today: IsoDate;
  actions: HabitActions;
}

/** A habit in the rail pane: today's checkbox, the name (opens details) and the streak. */
export function TodayHabitRow({ habit, today, actions }: TodayHabitRowProps) {
  const done = habit.checkins.includes(today);
  return (
    <li className="flex min-h-9 items-center gap-2 rounded-md px-2 coarse:min-h-11">
      <Checkbox
        checked={done}
        label={`Done today: “${habit.name}”`}
        onCheckedChange={() => {
          actions.toggle(habit, today);
        }}
      />
      <button
        type="button"
        onClick={() => {
          actions.open(habit);
        }}
        className="min-w-0 flex-1 truncate rounded-md text-left text-base"
      >
        {habit.name}
      </button>
      <StreakBadge streak={habit.current_streak} />
    </li>
  );
}
