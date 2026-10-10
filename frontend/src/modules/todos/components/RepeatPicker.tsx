import { Repeat as RepeatIcon } from "lucide-react";
import { useState } from "react";

import { useMeta } from "../../../core/api/coreQueries";
import { RecurrenceFields } from "../../../core/recurrence/RecurrenceFields";
import {
  describeRule,
  repeatOf,
  ruleOf,
  type Repeat,
  type RecurrenceSpec,
} from "../../../core/recurrence/recurrence";
import type { IsoDate } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Popover } from "../../../ui/Popover";
import { Select } from "../../../ui/Select";
import type { RepeatFrom, Todo } from "../types";

/** Props for {@link RepeatPicker}. */
export interface RepeatPickerProps {
  todo: Todo;
  today: IsoDate;
  /** Called on close when the repeat changed (rule null: stop repeating). */
  onChange: (rrule: string | null, repeatFrom: RepeatFrom) => void;
}

/** "After completion" has no fixed days: only every N days/weeks/months/years. */
function plainSpec(spec: RecurrenceSpec): RecurrenceSpec {
  return { ...spec, byDay: [], monthly: "day" };
}

/** The words for a todo's repeat, e.g. "Every 3 days after completion". */
function describeTodoRepeat(todo: Todo, timeZone: string): string {
  if (todo.rrule === null) return "Repeat";
  const anchor = todo.recurrence_anchor ?? todo.due_date ?? "";
  return describeRule(todo.rrule, anchor, timeZone, todo.repeat_from === "completion");
}

/**
 * A button describing the todo's repeat; opens the shared repeat editor. The
 * rule is relative to the due date (without one, the server starts it on the
 * series' first date from today). The next date follows the schedule, or is
 * counted from when the todo was done. Changes are saved when the popover
 * closes.
 */
export function RepeatPicker({ todo, today, onChange }: RepeatPickerProps) {
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Repeat>({ kind: "none" });
  const [from, setFrom] = useState<RepeatFrom>("due");
  const [touched, setTouched] = useState(false);
  const start = todo.due_date ?? today;
  const anchor = todo.recurrence_anchor ?? start;
  const afterCompletion = from === "completion" && draft.kind === "spec";

  const openChange = (next: boolean) => {
    if (next) {
      setDraft(repeatOf(todo.rrule, anchor, timeZone));
      setFrom(todo.rrule === null ? "due" : todo.repeat_from);
      setTouched(false);
    } else if (touched) {
      const rule = ruleOf(
        draft.kind === "spec" && from === "completion"
          ? { kind: "spec", spec: plainSpec(draft.spec) }
          : draft,
        start,
      );
      const repeatFrom = rule === null || draft.kind !== "spec" ? "due" : from;
      if (rule !== todo.rrule || (rule !== null && repeatFrom !== todo.repeat_from)) {
        onChange(rule, repeatFrom);
      }
    }
    setOpen(next);
  };

  const draftRule = ruleOf(draft, start);

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      label="Repeat"
      className="w-80"
      trigger={
        <Button size="sm" className={cx(todo.rrule === null && "text-text-muted")}>
          <RepeatIcon size={16} strokeWidth={1.75} aria-hidden />
          {describeTodoRepeat(todo, timeZone)}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <RecurrenceFields
          value={draft}
          start={start}
          timeZone={timeZone}
          plain={afterCompletion}
          description={
            afterCompletion && draftRule !== null
              ? describeRule(draftRule, start, timeZone, true)
              : undefined
          }
          onChange={(next) => {
            setDraft(next);
            setTouched(true);
          }}
        />
        {draft.kind === "spec" && (
          <Select
            aria-label="Next date counted from"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value === "completion" ? "completion" : "due");
              setTouched(true);
            }}
          >
            <option value="due">On schedule (skips missed dates)</option>
            <option value="completion">Counted from when it’s done</option>
          </Select>
        )}
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
