import { Trash2 } from "lucide-react";

import { LinkedItems } from "../../../core/links/LinkedItems";
import { AutosaveTextArea } from "../../../ui/AutosaveTextArea";
import { Button } from "../../../ui/Button";
import { InlineTitle } from "../../../ui/InlineTitle";
import { useHabitData } from "../queries";
import { habitRef } from "../types";
import { useHabitActions } from "../useHabitActions";
import { HistoryGrid } from "./HistoryGrid";
import { SchedulePicker } from "./SchedulePicker";
import { WeekStrip } from "./WeekStrip";

/** Props for {@link HabitDetail}. */
export interface HabitDetailProps {
  /** The habit's id (from `?item=habits.habit:<id>`). */
  id: string;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The detail panel for one habit: name, schedule, streaks, history, notes, links. */
export function HabitDetail({ id }: HabitDetailProps) {
  const { habits, today, loading } = useHabitData();
  const actions = useHabitActions();
  const habit = habits.find((h) => h.id === id);

  if (habit === undefined || today === null) {
    return (
      <p className="pt-4 text-base text-text-muted">
        {loading ? "" : "This habit is not here anymore (deleted)."}
      </p>
    );
  }

  const stats: [string, number][] = [
    ["Current streak", habit.current_streak],
    ["Best streak", habit.best_streak],
    ["Times done", habit.total_checkins],
  ];

  return (
    <div className="flex flex-col gap-5">
      <InlineTitle
        size="lg"
        label="Name"
        value={habit.name}
        onCommit={(name) => {
          actions.update(habit.id, { name });
        }}
      />
      <div>
        <SchedulePicker
          habit={habit}
          onChange={(rrule) => {
            actions.update(habit.id, { rrule });
          }}
        />
      </div>

      <WeekStrip habit={habit} today={today} actions={actions} />

      <dl className="grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-hover px-3 py-2">
            <dt className="text-xs text-text-muted">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <HistoryGrid habit={habit} today={today} />

      <AutosaveTextArea
        aria-label="Notes"
        placeholder="Notes"
        value={habit.notes}
        rows={4}
        onSave={(notes) => {
          actions.update(habit.id, { notes });
        }}
      />

      <LinkedItems entity={habitRef(habit.id)} title={habit.name} />

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-text-muted">
        <span>Since {dateFormat.format(new Date(`${habit.start_date}T12:00:00`))}</span>
        <Button
          size="sm"
          className="text-danger"
          onClick={() => {
            actions.remove(habit);
          }}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}
