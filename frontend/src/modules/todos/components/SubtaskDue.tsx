import { useState } from "react";

import type { IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import type { Todo } from "../types";
import type { TodoActions } from "../useTodoActions";
import { DueDatePicker } from "./DueDatePicker";

/** Props for {@link SubtaskDue}. */
export interface SubtaskDueProps {
  subtask: Todo;
  today: IsoDate;
  actions: TodoActions;
}

/**
 * A subtask's due date in the checklist. A set date always shows; without
 * one the calendar icon appears on hover and focus (always on touch).
 */
export function SubtaskDue({ subtask, today, actions }: SubtaskDueProps) {
  const [open, setOpen] = useState(false);
  const hidden = subtask.due_date === null && !open;
  return (
    <DueDatePicker
      compact
      label={`Add due date to “${subtask.title}”`}
      value={subtask.due_date}
      today={today}
      open={open}
      onOpenChange={setOpen}
      actions={actions}
      onChange={(date) => {
        actions.setDue(subtask, date);
      }}
      className={cx(
        hidden &&
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100",
      )}
    />
  );
}
