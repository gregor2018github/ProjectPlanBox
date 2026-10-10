import { CalendarClock } from "lucide-react";
import { useState } from "react";

import { useMeta } from "../../../core/api/coreQueries";
import { RecurrenceFields } from "../../../core/recurrence/RecurrenceFields";
import { describeRule, repeatOf, ruleOf, type Repeat } from "../../../core/recurrence/recurrence";
import { Button } from "../../../ui/Button";
import { Popover } from "../../../ui/Popover";
import { DEFAULT_RULE, type Habit } from "../types";

/** Props for {@link SchedulePicker}. */
export interface SchedulePickerProps {
  habit: Habit;
  /** Called on close when the rule changed. */
  onChange: (rrule: string) => void;
}

/**
 * A button describing the habit's schedule; opens the shared repeat editor.
 * The rule is relative to the habit's start date. "Does not repeat" is read
 * as daily, because a habit always has a schedule. Saves when it closes.
 */
export function SchedulePicker({ habit, onChange }: SchedulePickerProps) {
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Repeat>({ kind: "none" });
  const [touched, setTouched] = useState(false);

  const openChange = (next: boolean) => {
    if (next) {
      setDraft(repeatOf(habit.rrule, habit.start_date, timeZone));
      setTouched(false);
    } else if (touched) {
      const rule = ruleOf(draft, habit.start_date) ?? DEFAULT_RULE;
      if (rule !== habit.rrule) onChange(rule);
    }
    setOpen(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      label="Schedule"
      className="w-80"
      trigger={
        <Button size="sm" aria-label="Schedule">
          <CalendarClock size={16} strokeWidth={1.75} aria-hidden />
          {describeRule(habit.rrule, habit.start_date, timeZone)}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <RecurrenceFields
          value={draft}
          start={habit.start_date}
          timeZone={timeZone}
          onChange={(next) => {
            setDraft(next);
            setTouched(true);
          }}
        />
        <p className="text-sm text-text-muted">
          Streaks count the scheduled days. Checking off another day is fine but does not count.
        </p>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              openChange(false);
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Popover>
  );
}
