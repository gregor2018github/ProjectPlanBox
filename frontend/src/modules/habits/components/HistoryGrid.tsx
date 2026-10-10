import type { IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import { dayState, historyWeeks, HISTORY_WEEKS, type DayState } from "../days";
import type { Habit } from "../types";

/** Props for {@link HistoryGrid}. */
export interface HistoryGridProps {
  habit: Habit;
  today: IsoDate;
}

const CELL: Record<DayState, string> = {
  done: "bg-accent",
  missed: "bg-border-strong",
  open: "border border-accent",
  unscheduled: "bg-hover",
  future: "",
};

/**
 * The last 26 weeks at a glance: one column per week (Monday on top), filled
 * where the habit was done. Display only; days are checked in the week strip.
 */
export function HistoryGrid({ habit, today }: HistoryGridProps) {
  const weeks = historyWeeks(today);
  const scheduledPast = habit.scheduled.filter((d) => d <= today).length;
  const done = habit.checkins.filter((d) => habit.scheduled.includes(d)).length;
  return (
    <div
      role="img"
      aria-label={`Last ${HISTORY_WEEKS} weeks: done on ${done} of ${scheduledPast} scheduled days`}
      className="flex gap-0.5 overflow-x-auto"
    >
      {weeks.map((week) => (
        <div key={week[0]} className="flex flex-col gap-0.5">
          {week.map((day) => (
            <span
              key={day}
              className={cx("size-2.5 rounded-xs", CELL[dayState(habit, day, today)])}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
