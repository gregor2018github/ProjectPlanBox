import { useMeta } from "../../../core/api/coreQueries";
import { describeRule } from "../../../core/recurrence/recurrence";
import type { IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import type { Habit } from "../types";
import type { HabitActions } from "../useHabitActions";
import { StreakBadge } from "./StreakBadge";
import { WeekStrip } from "./WeekStrip";

/** Props for {@link HabitRow}. */
export interface HabitRowProps {
  habit: Habit;
  today: IsoDate;
  selected: boolean;
  actions: HabitActions;
}

/** A habit on the Habits page: name and schedule (opens details), streak, last 7 days. */
export function HabitRow({ habit, today, selected, actions }: HabitRowProps) {
  const timeZone = useMeta().data?.timezone ?? "UTC";
  return (
    <li
      className={cx(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-3 py-2",
        selected && "bg-selected",
      )}
    >
      <button
        type="button"
        onClick={() => {
          actions.open(habit);
        }}
        className="flex min-w-40 flex-1 basis-40 flex-col items-start rounded-md text-left"
      >
        <span className="w-full truncate text-base">{habit.name}</span>
        <span className="w-full truncate text-sm text-text-muted">
          {describeRule(habit.rrule, habit.start_date, timeZone)}
        </span>
      </button>
      <div className="flex items-center justify-between gap-4">
        <StreakBadge streak={habit.current_streak} />
        <WeekStrip habit={habit} today={today} actions={actions} />
      </div>
    </li>
  );
}
