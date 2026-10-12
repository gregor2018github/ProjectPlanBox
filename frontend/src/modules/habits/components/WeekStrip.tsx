import { format, parseISO } from "date-fns";
import { CalendarCheck, CalendarOff, Check, Undo2 } from "lucide-react";

import { formatDayShort, type IsoDate } from "../../../core/time";
import { ContextMenu } from "../../../ui/ContextMenu";
import type { MenuEntry } from "../../../ui/menuTypes";
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

/**
 * The last seven days of a habit, today last; each day toggles its check-in.
 * Right-click or long-press a day to take it off (or back on).
 */
export function WeekStrip({ habit, today, actions }: WeekStripProps) {
  const entries = (day: IsoDate): MenuEntry[] => {
    const checked = habit.checkins.includes(day);
    const off = habit.days_off.includes(day);
    return [
      {
        id: "check",
        label: checked ? "Uncheck" : "Check off",
        icon: checked ? Undo2 : Check,
        onSelect: () => {
          actions.toggle(habit, day);
        },
      },
      {
        id: "off",
        label: off ? "Back on the schedule" : "Day off",
        icon: off ? CalendarCheck : CalendarOff,
        onSelect: () => {
          actions.setDaysOff(
            [{ habit_id: habit.id, day }],
            !off,
            `${off ? "Back on" : "Day off"}: “${habit.name}” on ${formatDayShort(day)}`,
          );
        },
      },
    ];
  };

  return (
    <div role="group" aria-label={`${habit.name}, last 7 days`} className="flex gap-1.5">
      {daysEnding(today, STRIP_DAYS).map((day) => {
        const state = dayState(habit, day, today);
        return (
          <ContextMenu key={day} entries={entries(day)}>
            <DayToggle
              state={state}
              label={format(parseISO(day), "EEEEE")}
              ariaLabel={`${habit.name} on ${formatDayShort(day)}${state === "off" ? " (day off)" : ""}`}
              isToday={day === today}
              onToggle={() => {
                actions.toggle(habit, day);
              }}
            />
          </ContextMenu>
        );
      })}
    </div>
  );
}
