import { CalendarOff, X } from "lucide-react";
import { useState } from "react";

import { formatDayShort, type IsoDate } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { IconButton } from "../../../ui/IconButton";
import { Input } from "../../../ui/Input";
import { Popover } from "../../../ui/Popover";
import { Switch } from "../../../ui/Switch";
import { dayRuns, daysBetweenInclusive, type DayRun } from "../days";
import type { Habit, HabitDay } from "../types";
import type { HabitActions } from "../useHabitActions";

/** Props for {@link DaysOffSection}. */
export interface DaysOffSectionProps {
  habit: Habit;
  /** Every live habit, for "every habit" (a holiday). */
  habits: readonly Habit[];
  today: IsoDate;
  actions: HabitActions;
}

/** The longest stretch one change may take off. */
const MAX_DAYS = 366;

function runLabel(run: DayRun): string {
  return run.start === run.end
    ? formatDayShort(run.start)
    : `${formatDayShort(run.start)} – ${formatDayShort(run.end)}`;
}

/**
 * Days off for a habit: single dates or a stretch (a holiday) on which it is
 * not due, so they neither count nor break the streak. Lists the coming
 * ones; a stretch can be taken off for every habit at once.
 */
export function DaysOffSection({ habit, habits, today, actions }: DaysOffSectionProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [everyHabit, setEveryHabit] = useState(false);
  const runs = dayRuns(habit.days_off_ahead);
  const days = daysBetweenInclusive(from, to < from ? from : to);
  const valid = from !== "" && days.length <= MAX_DAYS;

  const openChange = (next: boolean) => {
    if (next) {
      setFrom(today);
      setTo(today);
      setEveryHabit(false);
    }
    setOpen(next);
  };

  const add = () => {
    if (!valid) return;
    const targets = everyHabit ? habits : [habit];
    const items: HabitDay[] = targets.flatMap((h) => days.map((day) => ({ habit_id: h.id, day })));
    const what = everyHabit ? "every habit" : `“${habit.name}”`;
    actions.setDaysOff(
      items,
      true,
      `Days off for ${what}: ${runLabel({ start: from, end: days.at(-1) ?? from })}`,
    );
    setOpen(false);
  };

  return (
    <section aria-label="Days off" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-text-muted">Days off</h2>
        <Popover
          open={open}
          onOpenChange={openChange}
          label="Add days off"
          align="end"
          className="w-72"
          trigger={
            <Button size="sm" className="text-text-muted">
              <CalendarOff size={16} strokeWidth={1.75} aria-hidden />
              Add days off
            </Button>
          }
        >
          <form
            className="flex flex-col gap-3 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm text-text-muted">
                From
                <Input
                  type="date"
                  value={from}
                  required
                  onChange={(event) => {
                    const value = event.target.value;
                    setFrom(value);
                    if (value !== "" && to < value) setTo(value);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-muted">
                To
                <Input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => {
                    setTo(event.target.value === "" ? from : event.target.value);
                  }}
                />
              </label>
            </div>
            {habits.length > 1 && (
              <Switch checked={everyHabit} onCheckedChange={setEveryHabit} label="Every habit" />
            )}
            <p className="text-sm text-text-muted">
              {days.length > MAX_DAYS
                ? `At most ${String(MAX_DAYS)} days at a time.`
                : "Not due on these days: they neither count nor break the streak."}
            </p>
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="primary" disabled={!valid}>
                Take {days.length === 1 ? "the day" : `${String(days.length)} days`} off
              </Button>
            </div>
          </form>
        </Popover>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-text-muted">None coming up.</p>
      ) : (
        <ul className="flex flex-col">
          {runs.map((run) => (
            <li
              key={run.start}
              className="flex items-center justify-between gap-2 rounded-md px-1 text-base tabular-nums hover:bg-hover"
            >
              {runLabel(run)}
              <IconButton
                label={`Back on the schedule: ${runLabel(run)}`}
                icon={X}
                onClick={() => {
                  actions.setDaysOff(
                    daysBetweenInclusive(run.start, run.end).map((day) => ({
                      habit_id: habit.id,
                      day,
                    })),
                    false,
                    `Back on the schedule: ${runLabel(run)}`,
                  );
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
