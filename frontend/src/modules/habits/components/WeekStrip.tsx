import { format, parseISO } from "date-fns";

import { formatDayShort, type IsoDate } from "../../../core/time";
import { daysEnding, dayState, STRIP_DAYS } from "../days";
import type { Habit } from "../types";
import type { HabitActions } from "../useHabitActions";
import { DayToggle } from "./DayToggle";

/** Props for {@link WeekStrip}. */
export interface WeekStripProps {
  habit: Habit;
  today: IsoDate;
  actions: HabitActions;
}

/** The last seven days of a habit, today last; each day toggles its check-in. */
export function WeekStrip({ habit, today, actions }: WeekStripProps) {
  return (
    <div role="group" aria-label={`${habit.name}, last 7 days`} className="flex gap-1.5">
      {daysEnding(today, STRIP_DAYS).map((day) => (
        <DayToggle
          key={day}
          state={dayState(habit, day, today)}
          label={format(parseISO(day), "EEEEE")}
          ariaLabel={`${habit.name} on ${formatDayShort(day)}`}
          isToday={day === today}
          onToggle={() => {
            actions.toggle(habit, day);
          }}
        />
      ))}
    </div>
  );
}
