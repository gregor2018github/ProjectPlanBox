import { formatCount, formatPercent, plural } from "../../../core/insights/format";
import type { IsoDate } from "../../../core/time";
import { rate30 } from "../insights";
import type { Habit } from "../types";

/** Props for {@link HabitStatsTable}. */
export interface HabitStatsTableProps {
  habits: readonly Habit[];
  today: IsoDate;
}

const NUMBER_CELL = "w-px px-2 py-1.5 text-right whitespace-nowrap tabular-nums";
const HEAD_CELL = "px-2 py-1.5 text-right font-medium whitespace-nowrap";

/** Every habit with its streaks, its last-30-days consistency and its total check-ins. */
export function HabitStatsTable({ habits, today }: HabitStatsTableProps) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted">
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Habit
            </th>
            <th scope="col" className={HEAD_CELL}>
              Streak
            </th>
            <th scope="col" className={HEAD_CELL}>
              Best
            </th>
            <th scope="col" className={HEAD_CELL}>
              Last 30 days
            </th>
            <th scope="col" className={HEAD_CELL}>
              Check-ins
            </th>
          </tr>
        </thead>
        <tbody>
          {habits.map((habit) => {
            const rate = rate30(habit, today);
            return (
              <tr key={habit.id} className="border-t border-border">
                <th scope="row" className="max-w-0 truncate px-2 py-1.5 text-left font-normal">
                  {habit.name}
                </th>
                <td className={NUMBER_CELL}>{plural(habit.current_streak, "day")}</td>
                <td className={NUMBER_CELL}>{plural(habit.best_streak, "day")}</td>
                <td className={NUMBER_CELL}>
                  {formatPercent(rate.done, rate.due)}
                  <span className="text-text-muted">
                    {" "}
                    ({formatCount(rate.done)}/{formatCount(rate.due)})
                  </span>
                </td>
                <td className={NUMBER_CELL}>{formatCount(habit.total_checkins)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
