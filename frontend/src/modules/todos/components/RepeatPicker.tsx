import { Repeat as RepeatIcon } from "lucide-react";
import { useState } from "react";

import { useMeta } from "../../../core/api/coreQueries";
import { RecurrenceFields } from "../../../core/recurrence/RecurrenceFields";
import { describeRule, repeatOf, ruleOf, type Repeat } from "../../../core/recurrence/recurrence";
import type { IsoDate } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Popover } from "../../../ui/Popover";
import type { Todo } from "../types";

/** Props for {@link RepeatPicker}. */
export interface RepeatPickerProps {
  todo: Todo;
  today: IsoDate;
  /** Called on close when the rule changed (null: stop repeating). */
  onChange: (rrule: string | null) => void;
}

/**
 * A button describing the todo's repeat; opens the shared repeat editor. The
 * rule is relative to the due date (today when there is none, which then
 * becomes the due date). Changes are saved when the popover closes.
 */
export function RepeatPicker({ todo, today, onChange }: RepeatPickerProps) {
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Repeat>({ kind: "none" });
  const [touched, setTouched] = useState(false);
  const start = todo.due_date ?? today;
  const anchor = todo.recurrence_anchor ?? start;

  const openChange = (next: boolean) => {
    if (next) {
      setDraft(repeatOf(todo.rrule, anchor, timeZone));
      setTouched(false);
    } else if (touched) {
      const rule = ruleOf(draft, start);
      if (rule !== todo.rrule) onChange(rule);
    }
    setOpen(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      label="Repeat"
      className="w-80"
      trigger={
        <Button size="sm" className={cx(todo.rrule === null && "text-text-muted")}>
          <RepeatIcon size={16} strokeWidth={1.75} aria-hidden />
          {todo.rrule === null ? "Repeat" : describeRule(todo.rrule, anchor, timeZone)}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <RecurrenceFields
          value={draft}
          start={start}
          timeZone={timeZone}
          onChange={(next) => {
            setDraft(next);
            setTouched(true);
          }}
        />
        <p className="text-sm text-text-muted">
          When you complete it, the next one is added with its new date.
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
